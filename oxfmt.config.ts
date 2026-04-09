import { defineConfig } from 'oxfmt'

export default defineConfig({
    semi: true,
    singleQuote: true,
    singleAttributePerLine: false,
    htmlWhitespaceSensitivity: 'ignore',
    printWidth: 100,
    tabWidth: 2,
    trailingComma: 'all',
    sortPackageJson: true,
    sortImports: {
        groups: [
            'type-import',
            ['value-builtin', 'value-external'],
            'type-internal',
            'value-internal',
            ['type-parent', 'type-sibling', 'type-index'],
            ['value-parent', 'value-sibling', 'value-index'],
            'unknown',
        ],
    },
    ignorePatterns: [
        '.github/**/*',
    ],
})