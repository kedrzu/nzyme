import type { ExtractPropTypes } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineContext, provideContext, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';
import type { FormFieldController } from './defineFormField.js';

const RadioGroupField = defineFormField<string>();

interface RadioGroupContext {
    field: FormFieldController<string>;
    props: ExtractPropTypes<typeof RadioGroupField.props>;
}

/**
 *
 */
export const RadioGroupContext = defineContext<RadioGroupContext>('RadioGroup');

/**
 *
 */
export const useRadioGroup = assignProps(setupRadioGroup, {
    props: RadioGroupField.props,
    emits: RadioGroupField.emits,
});

/**
 *
 */
function setupRadioGroup() {
    const props = useProps(RadioGroupField.props);
    const field = RadioGroupField.create({ props });

    provideContext(RadioGroupContext, { field, props });
}
