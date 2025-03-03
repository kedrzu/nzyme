const regex = /([\s-]+[a-z])/g;

export function toCamelCase(str: string) {
    if (str.length === 0) {
        return '';
    }

    const camelCase = toCamelCaseInternal(str);
    return camelCase[0]!.toLowerCase() + camelCase.slice(1);
}

export function toPascalCase(str: string) {
    if (str.length === 0) {
        return '';
    }

    const camelCase = toCamelCaseInternal(str);
    return camelCase[0]!.toUpperCase() + camelCase.slice(1);
}

function toCamelCaseInternal(str: string) {
    return str.replace(regex, (match, letter: string) => {
        return letter[letter.length - 1]!.toUpperCase();
    });
}
