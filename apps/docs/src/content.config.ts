import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        // The landing's pillars: the cells under its hero, on the hero's band (Hero.astro).
        // Frontmatter beside the hero's own copy, because the band is outside the page body.
        pillars: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
      }),
    }),
  }),
};
