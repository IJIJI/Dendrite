// Starlight's user config as a virtual module: what its own components read, and what a
// component override (src/components/SocialIcons.astro) reads too. Typed here for the one
// field that override uses, since Starlight ships no declaration for it.
declare module "virtual:starlight/user-config" {
  import type { StarlightIcon } from "@astrojs/starlight/types";
  const config: { social?: { label: string; href: string; icon: StarlightIcon }[] };
  export default config;
}
