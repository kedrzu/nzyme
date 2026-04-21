import { defineNuxtModule } from 'nuxt/kit';
import type { NuxtModule } from 'nuxt/schema';

/** Creates a Nuxt module that removes unnecessary path aliases, keeping only the @/ alias. */
export function simplifyAliasesModule(): NuxtModule {
    return defineNuxtModule({
        setup(_opts, nuxt) {
            // We only use @/ alias, remove all others.
            delete nuxt.options.alias['@@'];
            delete nuxt.options.alias['~'];
            delete nuxt.options.alias['~~'];
            // Access to assets and public folders through @/assets and @/public
            delete nuxt.options.alias['assets'];
            delete nuxt.options.alias['public'];
        },
    });
}
