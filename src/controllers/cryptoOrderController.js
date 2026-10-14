import "dotenv/config";
import { parse } from "@tma.js/init-data-node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ASSET_KEYS = {
  "USDT-BSC": "usdtbsc_balance",
  "USDT-TRC20": "usdttrc20_balance",
  BTC: "btc_balance",
};

function getInitData(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("tma ")) return null;
  return authorization.slice(4).trim();
}

async function getActiveProfileFromRequest(req) {
  const initData = getInitData(req);
  if (!initData) {
    const error = new Error("Telegram authentication data is missing.");
    error.status = 401;
    throw error;
  }
  // telegramAuth middleware already validated the signature with TELEGRAM_BOT_TOKEN.
  // Here we only need to read the user id from the init data.
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured on the backend.");
  }

  let parsed;
  try {
    parsed = parse(initData);
  } catch {
    const error = new Error("Telegram authentication data is invalid or expired.");
    error.status = 401;
    throw error;
  }

  const telegramId = parsed.user?.id;
  if (!telegramId) {
    const error = new Error("Telegram user could not be identified.");
    error.status = 401;
    throw error;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("telegram_id", String(telegramId))
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    const error = new Error("CoinEarn profile not found. Please reopen the app from Telegram.");
    error.status = 404;
    throw error;
  }
  if (profile.is_active === false) {
    const error = new Error("Your CoinEarn account is inactive.");
    error.status = 403;
    throw error;
  }
  return profile;
}

async function ensureWallet(userId) {
  const { error } = await supabase
    .from("crypto_wallets")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) throw error;

  const { data, error: walletError } = await supabase
    .from("crypto_wallets")
    .select("usdtbsc_balance, usdttrc20_balance, btc_balance")
    .eq("user_id", userId)
    .single();
  if (walletError) throw walletError;
  return data;
}

function toWalletResponse(wallet) {
  return {
    USDTBSC: Number(wallet?.usdtbsc_balance ?? 0),
    USDTTRC20: Number(wallet?.usdttrc20_balance ?? 0),
    BTC: Number(wallet?.btc_balance ?? 0),
  };
}

export async function getCryptoWalletBalances(req, res) {
  try {
    const profile = await getActiveProfileFromRequest(req);
    const wallet = await ensureWallet(profile.id);
    return res.json({ success: true, wallet: toWalletResponse(wallet) });
  } catch (error) {
    console.error("getCryptoWalletBalances:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Could not load crypto wallet balances.",
    });
  }
}

export async function createCryptoSmmOrder(req, res) {
  try {
    const profile = await getActiveProfileFromRequest(req);
    const { serviceId, target, quantity, asset } = req.body || {};

    if (!serviceId || typeof serviceId !== "string") {
      return res.status(400).json({ success: false, message: "A valid serviceId is required." });
    }
    if (typeof target !== "string" || !target.trim() || target.trim().length > 500) {
      return res.status(400).json({ success: false, message: "Enter a valid target (maximum 500 characters)." });
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, message: "Quantity must be a positive whole number." });
    }
    if (!Object.prototype.hasOwnProperty.call(ASSET_KEYS, asset)) {
      return res.status(400).json({ success: false, message: "Unsupported crypto asset." });
    }

    const { data: service, error: serviceError } = await supabase
      .from("smm_services")
      .select("id, active, min_quantity, max_quantity, crypto_price_usd")
      .eq("id", serviceId)
      .maybeSingle();
    if (serviceError) throw serviceError;
    if (!service || service.active !== true) {
      return res.status(404).json({ success: false, message: "Service is unavailable." });
    }
    if (quantity < Number(service.min_quantity) || quantity > Number(service.max_quantity)) {
      return res.status(400).json({ success: false, message: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}.` });
    }
    const pricePerThousand = Number(service.crypto_price_usd);
    if (!Number.isFinite(pricePerThousand) || pricePerThousand <= 0) {
      return res.status(400).json({ success: false, message: "Crypto pricing is not configured for this service yet." });
    }

    // Server calculates the USD price; never trust a client-supplied amount.
    const expectedUsdAmount = Number(((quantity * pricePerThousand) / 1000).toFixed(4));
    let cryptoAmount;
    if (asset === "BTC") {
      const priceResponse = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!priceResponse.ok) throw new Error("Unable to get the current BTC price. Please try again.");
      const priceJson = await priceResponse.json();
      const btcUsd = Number(priceJson?.bitcoin?.usd);
      if (!Number.isFinite(btcUsd) || btcUsd <= 0) throw new Error("BTC price quote is unavailable.");
      cryptoAmount = Number((expectedUsdAmount / btcUsd).toFixed(12));
    } else {
      cryptoAmount = Number(expectedUsdAmount.toFixed(8));
    }

    // Ensure wallet exists before invoking the atomic database transaction.
    await ensureWallet(profile.id);
    const { data: rpcData, error: rpcError } = await supabase.rpc("create_crypto_smm_order", {
      p_user_id: profile.id,
      p_service_id: service.id,
      p_target: target.trim(),
      p_quantity: quantity,
      p_crypto_asset: asset,
      p_crypto_amount: cryptoAmount,
      p_expected_usd_amount: expectedUsdAmount,
    });
    if (rpcError) {
      const message = rpcError.message || "Could not create crypto order.";
      const status = /insufficient|not found|inactive|quantity|price/i.test(message) ? 400 : 500;
      console.error("create_crypto_smm_order RPC error:", rpcError);
      return res.status(status).json({ success: false, message });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!result) throw new Error("Crypto order transaction returned no result.");
    const walletKey = ASSET_KEYS[asset];
    const { data: freshWallet, error: freshWalletError } = await supabase
      .from("crypto_wallets")
      .select("usdtbsc_balance, usdttrc20_balance, btc_balance")
      .eq("user_id", profile.id)
      .single();
    if (freshWalletError) throw freshWalletError;

    return res.status(201).json({
      success: true,
      order: {
        id: result.id,
        orderNumber: result.orderNumber ?? result.order_number ?? result.id,
        amount: Number(result.usdAmount ?? result.usd_amount ?? expectedUsdAmount),
        cryptoAmount: Number(result.cryptoAmount ?? result.crypto_amount ?? cryptoAmount),
        asset,
        balance: Number(freshWallet[walletKey]),
        status: result.status ?? "pending",
      },
    });
  } catch (error) {
    console.error("createCryptoSmmOrder:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : (error.message || "Could not create crypto order."),
    });
  }
}
