import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const PUBLIC_COLUMNS = `
  id,
  title,
  subtitle,
  image_url,
  link_url,
  sort_order
`;

const ADMIN_COLUMNS = `
  id,
  title,
  subtitle,
  image_url,
  link_url,
  sort_order,
  active,
  created_at,
  updated_at
`;

// Trimmed string, or null when empty / not a string.
function cleanOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

// Returns an error message, or null when the image link is acceptable.
function validateImageUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return "Image URL must start with https://";
    }

    return null;
  } catch {
    return "Please enter a valid image URL";
  }
}

// Returns an error message, or null when the link is acceptable.
// Accepts @username, t.me/..., telegram.me/..., or a full http(s) link.
function validateLinkUrl(value) {
  const link = value.trim();

  if (
    link.startsWith("@") ||
    link.startsWith("t.me/") ||
    link.startsWith("telegram.me/")
  ) {
    return null;
  }

  try {
    const url = new URL(link);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return "Link must start with https://, t.me/ or @";
    }

    return null;
  } catch {
    return "Link must start with https://, t.me/ or @";
  }
}


/*
|--------------------------------------------------------------------------
| PUBLIC: ACTIVE SLIDES FOR THE HOME PAGE
|--------------------------------------------------------------------------
*/

export async function getCarouselSlides(req, res) {
  try {
    const {
      data: slides,
      error,
    } = await supabase
      .from("carousel_slides")
      .select(PUBLIC_COLUMNS)
      .eq("active", true)
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Carousel lookup error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load carousel",
      });
    }

    return res.json({
      success: true,
      slides: slides || [],
    });
  } catch (error) {
    console.error(
      "Get carousel error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not load carousel",
    });
  }
}


/*
|--------------------------------------------------------------------------
| ADMIN: LIST ALL SLIDES
|--------------------------------------------------------------------------
*/

export async function getAdminCarousel(req, res) {
  try {
    const {
      data: slides,
      error,
    } = await supabase
      .from("carousel_slides")
      .select(ADMIN_COLUMNS)
      .order("sort_order", {
        ascending: true,
      })
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      console.error(
        "Admin carousel lookup error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load carousel slides",
      });
    }

    return res.json({
      success: true,
      slides: slides || [],
    });
  } catch (error) {
    console.error(
      "Get admin carousel error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not load carousel slides",
    });
  }
}


/*
|--------------------------------------------------------------------------
| ADMIN: CREATE SLIDE
|--------------------------------------------------------------------------
*/

export async function createCarouselSlide(req, res) {
  try {
    const {
      title,
      subtitle,
      image_url,
      link_url,
      sort_order,
      active,
    } = req.body;

    const slideTitle =
      cleanOptionalText(title);

    const slideSubtitle =
      cleanOptionalText(subtitle);

    const slideImage =
      cleanOptionalText(image_url);

    const slideLink =
      cleanOptionalText(link_url);

    const slideActive =
      typeof active === "boolean"
        ? active
        : true;

    if (!slideImage) {
      return res.status(400).json({
        success: false,
        message:
          "Slide image URL is required",
      });
    }

    const imageError =
      validateImageUrl(slideImage);

    if (imageError) {
      return res.status(400).json({
        success: false,
        message: imageError,
      });
    }

    if (slideLink) {
      const linkError =
        validateLinkUrl(slideLink);

      if (linkError) {
        return res.status(400).json({
          success: false,
          message: linkError,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | SORT ORDER
    |
    | If none is given, the new slide goes to the end.
    |--------------------------------------------------------------------------
    */

    let slideOrder;

    if (
      sort_order !== undefined &&
      sort_order !== null &&
      sort_order !== ""
    ) {
      slideOrder =
        Number(sort_order);

      if (!Number.isInteger(slideOrder)) {
        return res.status(400).json({
          success: false,
          message:
            "Order must be a whole number",
        });
      }
    } else {
      const {
        data: lastSlide,
      } = await supabase
        .from("carousel_slides")
        .select("sort_order")
        .order("sort_order", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      slideOrder =
        lastSlide
          ? Number(lastSlide.sort_order || 0) + 1
          : 0;
    }

    const {
      data: slide,
      error,
    } = await supabase
      .from("carousel_slides")
      .insert({
        title: slideTitle,
        subtitle: slideSubtitle,
        image_url: slideImage,
        link_url: slideLink,
        sort_order: slideOrder,
        active: slideActive,
      })
      .select(ADMIN_COLUMNS)
      .single();

    if (error) {
      console.error(
        "Create carousel slide error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not create slide",
      });
    }

    return res.status(201).json({
      success: true,
      message:
        "Slide created successfully",
      slide,
    });
  } catch (error) {
    console.error(
      "Create carousel slide controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while creating slide",
    });
  }
}


/*
|--------------------------------------------------------------------------
| ADMIN: UPDATE SLIDE
|--------------------------------------------------------------------------
*/

export async function updateCarouselSlide(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Slide ID is required",
      });
    }

    const {
      title,
      subtitle,
      image_url,
      link_url,
      sort_order,
      active,
    } = req.body;

    const updateData = {};

    if (title !== undefined) {
      updateData.title =
        cleanOptionalText(title);
    }

    if (subtitle !== undefined) {
      updateData.subtitle =
        cleanOptionalText(subtitle);
    }

    if (image_url !== undefined) {
      const slideImage =
        cleanOptionalText(image_url);

      if (!slideImage) {
        return res.status(400).json({
          success: false,
          message:
            "Slide image URL cannot be empty",
        });
      }

      const imageError =
        validateImageUrl(slideImage);

      if (imageError) {
        return res.status(400).json({
          success: false,
          message: imageError,
        });
      }

      updateData.image_url =
        slideImage;
    }

    if (link_url !== undefined) {
      const slideLink =
        cleanOptionalText(link_url);

      if (slideLink) {
        const linkError =
          validateLinkUrl(slideLink);

        if (linkError) {
          return res.status(400).json({
            success: false,
            message: linkError,
          });
        }
      }

      updateData.link_url =
        slideLink;
    }

    if (sort_order !== undefined) {
      const slideOrder =
        Number(sort_order);

      if (!Number.isInteger(slideOrder)) {
        return res.status(400).json({
          success: false,
          message:
            "Order must be a whole number",
        });
      }

      updateData.sort_order =
        slideOrder;
    }

    if (active !== undefined) {
      if (typeof active !== "boolean") {
        return res.status(400).json({
          success: false,
          message:
            "Active must be true or false",
        });
      }

      updateData.active =
        active;
    }

    if (
      Object.keys(updateData).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No slide changes provided",
      });
    }

    updateData.updated_at =
      new Date().toISOString();

    const {
      data: slide,
      error,
    } = await supabase
      .from("carousel_slides")
      .update(updateData)
      .eq("id", id)
      .select(ADMIN_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error(
        "Update carousel slide error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not update slide",
      });
    }

    if (!slide) {
      return res.status(404).json({
        success: false,
        message:
          "Slide not found",
      });
    }

    return res.json({
      success: true,
      message:
        "Slide updated successfully",
      slide,
    });
  } catch (error) {
    console.error(
      "Update carousel slide controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while updating slide",
    });
  }
}


/*
|--------------------------------------------------------------------------
| ADMIN: DELETE SLIDE
|--------------------------------------------------------------------------
*/

export async function deleteCarouselSlide(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Slide ID is required",
      });
    }

    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from("carousel_slides")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Delete carousel lookup error:",
        existingError
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not find slide",
      });
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        message:
          "Slide not found",
      });
    }

    const {
      error,
    } = await supabase
      .from("carousel_slides")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(
        "Delete carousel slide error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not delete slide",
      });
    }

    return res.json({
      success: true,
      message:
        "Slide deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete carousel slide controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while deleting slide",
    });
  }
}