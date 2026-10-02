import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { defineRule } from '@nzyme/validation/rules/defineRule.js';
import type { ValidationContext, Validator } from '@nzyme/validation/Validator.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createApp, effectScope, nextTick, reactive, ref } from 'vue';

import { useForm } from './useForm.js';
import { useFormField } from './useFormField.js';
import { useFormFieldArray } from './useFormFieldArray.js';
import { useFormFields } from './useFormFields.js';
import { useRules } from './useRules.js';
import { requiredValidator } from './validators/requiredValidator.js';

interface Option {
    label: string;
}

interface Step {
    question: string;
    options: Option[];
}

interface Workflow {
    name: string;
    steps: Step[];
}

const requiredText: Validator<string> = value => (value ? null : 'Required');

const optionRule = defineRule<Option>((option, v) => {
    v.field(option, 'label', requiredText);
});

const stepRule = defineRule<Step>((step, v) => {
    v.field(step, 'question', requiredText);
    v.each(step, 'options', optionRule);
    if (step.options.length === 0) {
        v.error('options', 'No options');
    }
});

const workflowRule = defineRule<Workflow>((workflow, v) => {
    v.field(workflow, 'name', requiredText);
    v.each(workflow, 'steps', stepRule);
});

let ctx: ReturnType<typeof createTestContext>;

beforeEach(() => {
    ctx = createTestContext();
});

describe('routing', () => {
    test('a message reaches the field keyed by its path', () => {
        ctx.run(() => {
            const form = useForm<Step>({ question: '', options: [{ label: 'a' }] });
            const fields = useFormFields(form, { question: [], options: [] });
            useRules(form, stepRule);

            expect(fields.question.validators.at(-1)?.messages).toEqual(['Required']);
            expect(fields.options.validators.at(-1)?.messages).toEqual([]);
        });
    });

    test('fields created after useRules receive messages too', () => {
        ctx.run(() => {
            const form = useForm<Step>({ question: '', options: [{ label: 'a' }] });
            useRules(form, stepRule);
            const fields = useFormFields(form, { question: [] });

            expect(fields.question.validators.at(-1)?.messages).toEqual(['Required']);
        });
    });

    test('a message without a receiving field goes to the nearest ancestor', () => {
        ctx.run(() => {
            const form = useForm<Step>({ question: 'Q', options: [{ label: '' }] });
            const fields = useFormFields(form, { options: [] });
            useRules(form, stepRule);

            // `options.0.label` has no field; `options` is the nearest one on its path.
            expect(fields.options.validators.at(-1)?.messages).toEqual(['Required']);
        });
    });

    test('a message with no field on its path is carried by the root form', async () => {
        await ctx.run(async () => {
            const form = useForm<Step>({ question: '', options: [] });
            useRules(form, stepRule);

            expect(form.valid).toBe(false);
            expect(form.invalid).toBe(false);
            expect(await form.validate()).toBe(false);
            expect(form.invalid).toBe(true);

            form.reset();
            expect(form.invalid).toBe(false);

            form.value.question = 'Q';
            form.value.options.push({ label: 'a' });
            expect(form.valid).toBe(true);
            expect(await form.validate()).toBe(true);
        });
    });

    test("an alias field receives its parent's path messages", () => {
        ctx.run(() => {
            const form = useForm<Step>({ question: 'Q', options: [] });
            const fields = useFormFields(form, {
                options: f => ({ form: useFormField(f, { validators: [] }), parent: f }),
            });
            useRules(form, stepRule);

            expect(fields.options.form.key).toBeNull();
            expect(fields.options.form.validators.at(-1)?.messages).toEqual(['No options']);
            expect(fields.options.parent.fields.length).toBe(1);
        });
    });

    test('an alias of the form useRules is registered on receives its root messages', () => {
        ctx.run(() => {
            const form = useForm({ text: 'x' });
            const field = useFormField(form, { value: ref({ text: '' }), key: 'nested' });
            const alias = useFormField(field, { validators: [] });
            useRules(field, (value, v) => {
                if (!value.text) {
                    v.error(null, 'Empty');
                }
            });

            expect(alias.validators.at(-1)?.messages).toEqual(['Empty']);
            expect(field.validators.at(-1)?.messages).toEqual([]);
        });
    });

    test('a field with its own value and no key is opaque to routing', () => {
        ctx.run(() => {
            const form = useForm<Step>({ question: '', options: [{ label: 'a' }] });
            const opaque = useFormField(form, { value: ref<Pick<Step, 'question'>>({ question: '' }) });
            const nested = useFormFields(opaque, { question: [] });
            useRules(form, stepRule);

            expect(opaque.validators).toEqual([]);
            expect(nested.question.validators).toEqual([]);
            expect(form.valid).toBe(false);
        });
    });

    test('a dotted, reactive key addresses a subtree', () => {
        ctx.run(() => {
            const form = useForm<Workflow>({ name: 'W', steps: [{ question: 'Q', options: [] }, makeStep()] });
            const index = ref(0);
            const stepForm = useFormField(form, {
                value: ref(form.value.steps[0]!),
                key: () => `steps.${index.value}`,
            });
            useRules(form, workflowRule);

            expect(stepForm.key).toBe('steps.0');
            expect(stepForm.validators.at(-1)?.messages).toEqual(['No options']);

            index.value = 1;
            expect(stepForm.key).toBe('steps.1');
            expect(stepForm.validators.at(-1)?.messages).toEqual([]);
        });
    });

    test('messages keep their identity while their content does not change', () => {
        ctx.run(() => {
            const form = useForm<Step>({ question: '', options: [] });
            const fields = useFormFields(form, { question: [], options: [] });
            useRules(form, stepRule);

            const before = fields.question.validators.at(-1)?.messages;
            form.value.options.push({ label: '' });
            expect(fields.question.validators.at(-1)?.messages).toBe(before);
            expect(fields.options.validators.at(-1)?.messages).toEqual(['Required']);
        });
    });

    test('the rule gets the reactive ctx, or the form language without one', () => {
        interface NamesContext extends ValidationContext {
            taken: string[];
        }

        ctx.run(() => {
            const taken = ref<string[]>([]);
            const form = useForm({ name: 'a' });
            const fields = useFormFields(form, { name: [] });
            const langRule = mock((_: { name: string }, _v: unknown, ruleCtx: ValidationContext) => {
                expect(ruleCtx).toEqual({ lang: 'en' });
            });
            useRules(form, langRule);
            useRules(
                form,
                defineRule<{ name: string }, NamesContext>((value, v, ruleCtx) => {
                    if (ruleCtx.taken.includes(value.name)) {
                        v.error('name', 'Taken');
                    }
                }),
                { ctx: () => ({ lang: form.lang, taken: taken.value }) },
            );

            expect(fields.name.validators.at(-1)?.messages).toEqual([]);
            taken.value = ['a'];
            expect(fields.name.validators.at(-1)?.messages).toEqual(['Taken']);
            expect(langRule).toHaveBeenCalled();
        });
    });
});

describe('field state', () => {
    test('rule errors show like a built-in validator: after edit and blur, or after validate()', async () => {
        await ctx.run(async () => {
            const form = useForm<Step>({ question: 'Q', options: [{ label: 'a' }] });
            const fields = useFormFields(form, { question: [] });
            useRules(form, stepRule);

            fields.question.focus();
            fields.question.value = '';
            await nextTick();
            expect(fields.question.validators.at(-1)?.messages).toEqual(['Required']);
            expect(fields.question.errors).toEqual([]);
            expect(fields.question.valid).toBe(false);
            expect(fields.question.invalid).toBe(false);

            fields.question.blur();
            await nextTick();
            expect(fields.question.errors).toEqual(['Required']);
            expect(fields.question.invalid).toBe(true);

            form.reset();
            expect(fields.question.errors).toEqual([]);
            expect(form.invalid).toBe(false);

            expect(await form.validate()).toBe(false);
            expect(fields.question.errors).toEqual(['Required']);
            expect(form.valid).toBe(false);
            expect(form.invalid).toBe(true);
        });
    });

    test('rule messages follow the built-in validators of the field', async () => {
        await ctx.run(async () => {
            const form = useForm<Step>({ question: '', options: [{ label: 'a' }] });
            const fields = useFormFields(form, { question: [requiredValidator({ message: () => 'Built-in' })] });
            useRules(form, stepRule);

            expect(fields.question.validators.length).toBe(2);
            expect(await fields.question.validate()).toBe(false);
            expect(fields.question.errors).toEqual(['Built-in', 'Required']);
        });
    });

    test('a field reports every message routed to it', async () => {
        await ctx.run(async () => {
            const form = useForm<Step>({ question: 'Q', options: [{ label: '' }, { label: '' }] });
            const fields = useFormFields(form, { options: [] });
            useRules(form, stepRule);

            expect(await form.validate()).toBe(false);
            expect(fields.options.errors).toEqual(['Required', 'Required']);
            expect(fields.options.validators.at(-1)?.error).toBe('Required');
        });
    });

    test('a form without useRules keeps its validators and has no rule errors', () => {
        ctx.run(() => {
            const form = useForm<Step>({ question: '', options: [] });
            const fields = useFormFields(form, { question: [requiredValidator()], options: [] });

            expect(fields.question.validators.length).toBe(1);
            expect(fields.options.validators).toEqual([]);
            expect(form.ruleErrors).toBeNull();
            expect(fields.question.ruleErrors).toBeNull();
        });
    });

    test('validate() right after adding an array item sees the new item', async () => {
        await ctx.run(async () => {
            const form = useForm<Step>({ question: 'Q', options: [{ label: 'a' }] });
            const fields = useFormFields(form, {
                options: f => useFormFieldArray(f, o => useFormFields(o, { label: [] })),
            });
            useRules(form, stepRule);
            expect(await form.validate()).toBe(true);

            form.value.options.push({ label: '' });
            // The item's fields are created on the next flush; the message is not lost meanwhile.
            expect(fields.options.length).toBe(1);
            expect(await form.validate()).toBe(false);
            expect(form.valid).toBe(false);

            await nextTick();
            expect(fields.options.length).toBe(2);
            expect(fields.options[1]?.label.validators.at(-1)?.messages).toEqual(['Required']);
            expect(await form.validate()).toBe(false);
            expect(fields.options[1]?.label.errors).toEqual(['Required']);

            form.value.options[1]!.label = 'b';
            expect(await form.validate()).toBe(true);
        });
    });
});

describe('ruleErrors', () => {
    test('the root holds every registration under paths built from field keys', () => {
        ctx.run(() => {
            const form = useForm<Workflow>({ name: '', steps: [makeStep(), { question: '', options: [] }] });
            useRules(form, workflowRule, { stopAt: ['steps'] });
            const stepForms = form.value.steps.map((step, index) => {
                const stepForm = useFormField(form, { value: ref(step), key: `steps.${index}` });
                useRules(stepForm, stepRule);
                return stepForm;
            });

            expect(form.ruleErrors).toEqual({
                name: ['Required'],
                'steps.1.question': ['Required'],
                'steps.1.options': ['No options'],
            });
            expect(stepForms[1]?.ruleErrors).toEqual({ question: ['Required'], options: ['No options'] });
            expect(stepForms[0]?.ruleErrors).toBeNull();
        });
    });

    test('registrations separated by stopAt do not duplicate messages', () => {
        ctx.run(() => {
            const form = useForm<Workflow>({ name: 'W', steps: [{ question: '', options: [{ label: 'a' }] }] });
            useRules(form, workflowRule, { stopAt: ['steps'] });
            const stepForm = useFormField(form, { value: ref(form.value.steps[0]!), key: 'steps.0' });
            useRules(stepForm, stepRule);
            const fields = useFormFields(stepForm, { question: [] });

            expect(form.ruleErrors).toEqual({ 'steps.0.question': ['Required'] });
            expect(fields.question.validators.at(-1)?.messages).toEqual(['Required']);
        });
    });

    test('nested fields contribute under their keys, aliases under their parent', () => {
        ctx.run(() => {
            const form = useForm<Step>({ question: 'Q', options: [{ label: 'a' }] });
            const fields = useFormFields(form, {
                options: f => useFormField(f, { validators: [] }),
            });
            useRules(fields.options, (options: Option[], v) => {
                if (options.length < 2) {
                    v.error(null, 'Too few');
                }
            });

            expect(fields.options.ruleErrors).toEqual({ '': ['Too few'] });
            expect(form.ruleErrors).toEqual({ options: ['Too few'] });
        });
    });

    test('disposing a step scope removes its registration and stops its rule', () => {
        ctx.run(() => {
            const workflow = reactive<Workflow>({ name: 'W', steps: [{ question: '', options: [] }] });
            const form = useForm(workflow);
            useRules(form, workflowRule, { stopAt: ['steps'] });

            const stepRuleSpy = mock(stepRule);
            const scope = effectScope();
            const stepForm = scope.run(() => {
                const field = useFormField(form, { value: ref(workflow.steps[0]!), key: 'steps.0' });
                useRules(field, stepRuleSpy);
                useFormFields(field, { question: [] });
                return field;
            })!;

            expect(form.ruleErrors).toEqual({ 'steps.0.question': ['Required'], 'steps.0.options': ['No options'] });
            expect(form.valid).toBe(false);

            scope.stop();

            expect(form.fields).not.toContain(stepForm);
            expect(form.ruleErrors).toBeNull();
            expect(form.valid).toBe(true);

            const calls = stepRuleSpy.mock.calls.length;
            stepForm.value = { question: '', options: [{ label: '' }] };
            expect(form.ruleErrors).toBeNull();
            expect(stepRuleSpy.mock.calls.length).toBe(calls);
        });
    });

    test('the rule state of a field lives in the field scope, even when useRules runs elsewhere', async () => {
        await ctx.run(async () => {
            const form = useForm<Workflow>({ name: 'W', steps: [{ question: '', options: [] }] });
            const stepScope = effectScope();
            const stepForm = stepScope.run(() => {
                return useFormField(form, { value: ref(form.value.steps[0]!), key: 'steps.0' });
            })!;
            useRules(form, workflowRule);

            const rules = stepForm.validators.at(-1)!;
            expect(rules.messages).toEqual(['Required', 'No options']);

            stepScope.stop();

            // Edit and blur would show the error if the show behavior's watchers had outlived the field.
            stepForm.focus();
            stepForm.value = { question: '', options: [{ label: '' }] };
            await nextTick();
            stepForm.blur();
            await nextTick();
            expect(rules.show).toBe(false);
        });
    });

    test('removing an array item drops its field and its rule state', async () => {
        await ctx.run(async () => {
            const form = useForm<Step>({ question: 'Q', options: [{ label: 'a' }, { label: '' }] });
            const fields = useFormFields(form, {
                options: f => useFormFieldArray(f, o => useFormFields(o, { label: [] })),
            });
            useRules(form, stepRule);

            const removed = fields.options[1]!.label;
            expect(removed.validators.at(-1)?.messages).toEqual(['Required']);

            form.value.options.pop();
            await nextTick();

            expect(fields.options.length).toBe(1);
            expect(form.ruleErrors).toBeNull();
            expect(await form.validate()).toBe(true);
        });
    });
});

function makeStep(): Step {
    return { question: 'Q', options: [{ label: 'a' }] };
}

function createTestContext() {
    const app = createApp({ render: () => null });
    const container = createContainer();
    container.set(LanguageContext, () => 'en');
    app.provide(container.injectionKey, container);

    const scope = effectScope();

    return {
        run<T>(fn: () => T): T {
            return app.runWithContext(() => scope.run(fn))!;
        },
    };
}
