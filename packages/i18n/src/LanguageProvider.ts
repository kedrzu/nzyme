import { defineInterface } from '@nzyme/ioc';

export interface LanguageProvider {
    (): string;
}

export const LanguageProvider = defineInterface<LanguageProvider>({
    name: 'LanguageProvider',
});
