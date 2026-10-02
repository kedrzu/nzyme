import { describe, expect, mock, test } from 'bun:test';

import { assertNever } from '@nzyme/utils/assertNever.js';

import type { ValidationContext, ValidationErrors, Validator } from '../Validator.js';
import { maxLength } from '../validators/maxLength.js';
import { required } from '../validators/required.js';
import { defineRule } from './defineRule.js';
import { validateRules } from './validateRules.js';

interface Translated {
    en?: string;
    pl?: string;
}

interface Option {
    label: string;
}

interface QuestionStep {
    type: 'question';
    question: Translated;
    options: Option[] | null;
}

interface MessageStep {
    type: 'message';
    text: string;
    attachment?: { name: string } | null;
}

type Step = QuestionStep | MessageStep;

interface Workflow {
    name: string;
    steps: Step[];
}

interface WorkflowContext extends ValidationContext {
    knownNames: string[];
}

const ctx: WorkflowContext = { lang: 'en', knownNames: [] };

/** Mirrors a translation validator: reports each missing language under its own key. */
const translated: Validator<Translated> = value => {
    const errors: ValidationErrors = {};
    if (!value.en) {
        errors.en = ['Missing English'];
    }
    if (!value.pl) {
        errors.pl = ['Missing Polish'];
    }
    return errors;
};

const requiredField = required({ message: () => 'Required' });
const shortText = maxLength(3, { message: () => 'Too long' });

const optionRule = defineRule<Option>((option, v) => {
    v.field(option, 'label', requiredField);
});

const stepRule = defineRule<Step, WorkflowContext>((step, v) => {
    switch (step.type) {
        case 'question':
            v.field(step, 'question', translated);
            v.each(step, 'options', optionRule);
            if (step.options?.length === 0) {
                v.error('options', 'At least one option');
            }
            return;
        case 'message':
            v.field(step, 'text', requiredField, shortText);
            v.nested(step, 'attachment', (attachment, av) => {
                av.field(attachment, 'name', requiredField);
                av.error(null, 'Attachment rejected');
            });
            return;
        default:
            assertNever(step);
    }
});

const workflowRule = defineRule<Workflow, WorkflowContext>((workflow, v, c) => {
    v.field(workflow, 'name', requiredField);
    if (c.knownNames.includes(workflow.name)) {
        v.error('name', 'Name taken');
    }
    if (workflow.steps.length > 2) {
        v.error(null, 'Too many steps');
    }
    v.each(workflow, 'steps', stepRule);
});

describe('validateRules', () => {
    test('returns null for a valid value', () => {
        const workflow: Workflow = {
            name: 'Intake',
            steps: [{ type: 'question', question: { en: 'Q', pl: 'P' }, options: [{ label: 'A' }] }],
        };

        expect(validateRules(workflow, workflowRule, ctx)).toBeNull();
    });

    test('reports messages at full dotted paths through each, union and nested', () => {
        const workflow: Workflow = {
            name: '',
            steps: [
                { type: 'question', question: { en: 'Q' }, options: [{ label: 'A' }, { label: ' ' }] },
                { type: 'message', text: 'Too long', attachment: { name: '' } },
                { type: 'question', question: { en: 'Q', pl: 'P' }, options: [] },
            ],
        };

        expect(validateRules(workflow, workflowRule, ctx)).toEqual({
            name: ['Required'],
            '': ['Too many steps'],
            'steps.0.question.pl': ['Missing Polish'],
            'steps.0.options.1.label': ['Required'],
            'steps.1.text': ['Too long'],
            'steps.1.attachment.name': ['Required'],
            'steps.1.attachment': ['Attachment rejected'],
            'steps.2.options': ['At least one option'],
        });
    });

    test('runs every validator of a field without short-circuiting', () => {
        const rule = defineRule<MessageStep>((step, v) => {
            v.field(
                step,
                'text',
                () => 'first',
                () => 'second',
            );
        });

        expect(validateRules({ type: 'message', text: '' }, rule, ctx)).toEqual({ text: ['first', 'second'] });
    });

    test('skips nested rules for null and undefined children and each for a null array', () => {
        const attachmentRule = mock(() => undefined);
        const itemRule = mock(() => undefined);
        const rule = defineRule<Step>((step, v) => {
            switch (step.type) {
                case 'question':
                    v.each(step, 'options', itemRule);
                    return;
                case 'message':
                    v.nested(step, 'attachment', attachmentRule);
                    return;
                default:
                    assertNever(step);
            }
        });

        validateRules({ type: 'message', text: 'x' }, rule, ctx);
        validateRules({ type: 'message', text: 'x', attachment: null }, rule, ctx);
        validateRules({ type: 'question', question: {}, options: null }, rule, ctx);

        expect(attachmentRule).not.toHaveBeenCalled();
        expect(itemRule).not.toHaveBeenCalled();
    });

    test('passes the context to rules', () => {
        const workflow: Workflow = { name: 'Intake', steps: [] };

        expect(validateRules(workflow, workflowRule, { ...ctx, knownNames: ['Intake'] })).toEqual({
            name: ['Name taken'],
        });
    });

    describe('stopAt', () => {
        const workflow: Workflow = {
            name: '',
            steps: [
                { type: 'question', question: { en: 'Q' }, options: [{ label: '' }] },
                { type: 'question', question: {}, options: [] },
            ],
        };

        test('prunes the subtree and drops every message under it', () => {
            const visitedSteps: Step[] = [];
            const rule = defineRule<Workflow, WorkflowContext>((value, v, c) => {
                workflowRule(value, v, c);
                v.error('steps.1.question', 'Reported by the parent');
                v.each(value, 'steps', (step, sv) => {
                    visitedSteps.push(step);
                    sv.error(null, 'step visited');
                });
            });

            expect(validateRules(workflow, rule, ctx, { stopAt: ['steps.1'] })).toEqual({
                name: ['Required'],
                'steps.0.question.pl': ['Missing Polish'],
                'steps.0.options.0.label': ['Required'],
                'steps.0': ['step visited'],
            });
            expect(visitedSteps).toEqual(workflow.steps.slice(0, 1));
        });

        test('drops nested results of a field validator under a pruned path', () => {
            expect(validateRules(workflow, workflowRule, ctx, { stopAt: ['steps.0.question.pl'] })).toEqual({
                name: ['Required'],
                'steps.0.options.0.label': ['Required'],
                'steps.1.question.en': ['Missing English'],
                'steps.1.question.pl': ['Missing Polish'],
                'steps.1.options': ['At least one option'],
            });
        });

        test('wildcard matches exactly one segment', () => {
            expect(validateRules(workflow, workflowRule, ctx, { stopAt: ['steps.*.options', '*.question'] })).toEqual({
                name: ['Required'],
                'steps.0.question.pl': ['Missing Polish'],
                'steps.1.question.en': ['Missing English'],
                'steps.1.question.pl': ['Missing Polish'],
            });
        });

        test('keeps messages above the pruned prefix', () => {
            const rule = defineRule<Workflow>((value, v) => {
                v.error('steps', 'Steps out of order');
                v.each(value, 'steps', (_, sv) => sv.error(null, 'step visited'));
            });

            expect(validateRules(workflow, rule, ctx, { stopAt: ['steps.*'] })).toEqual({
                steps: ['Steps out of order'],
            });
        });
    });
});
