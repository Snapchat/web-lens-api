import playcanvasConfig from '@playcanvas/eslint-config';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

// The shared config's rules, merged in order so a later object wins, as it does in ESLint.
const pcRules = Object.assign({}, ...playcanvasConfig.map(config => config.rules));
// Reused below for the TypeScript-aware twins; 'off' if a future release stops setting one.
const pcRule = name => pcRules[name] ?? 'off';
const pcTags = pcRules['jsdoc/check-tag-names']?.[1]?.definedTags ?? [];

export default [
    {
        ignores: ['dist/', 'docs/', 'examples/bitmoji-dance/playcanvas.min.js', 'examples/bitmoji-dance/snap-api.js']
    },
    ...playcanvasConfig,
    {
        files: ['examples/**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: { ...globals.browser, pc: 'readonly', snapchat: 'readonly' }
        }
    },
    {
        settings: {
            'import/resolver': {
                typescript: {}
            }
        }
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            globals: globals.browser
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        settings: {
            // Lets import/named read the .ts modules these files import.
            'import/parsers': { '@typescript-eslint/parser': ['.ts'] }
        },
        rules: {
            // Misreads type arguments: in `new Map<K, { resolve: (v) => void }>()` its fix deletes the space after `resolve:`.
            'func-call-spacing': 'off',
            // The compiler already checks these, and the core versions misread type-only declarations.
            'no-undef': 'off',
            'no-redeclare': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': pcRule('no-unused-vars'),
            'no-use-before-define': 'off',
            '@typescript-eslint/no-use-before-define': pcRule('no-use-before-define'),
            // Types live in the signatures; JSDoc carries descriptions only.
            'jsdoc/require-param-type': 'off',
            'jsdoc/require-returns-type': 'off',
            'jsdoc/check-tag-names': ['error', {
                definedTags: [...pcTags, 'packageDocumentation']
            }]
        }
    },
    {
        files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
        languageOptions: {
            globals: globals.node
        }
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: {
            // Cases, and the steps inside each, run one after another on purpose.
            'no-await-in-loop': 'off'
        }
    },
    {
        files: ['examples/**/*.mjs'],
        languageOptions: {
            globals: globals.browser
        },
        rules: {
            // The API's default export is the same singleton as its named `snapchat` export.
            'import/no-named-as-default': 'off'
        }
    }
];
