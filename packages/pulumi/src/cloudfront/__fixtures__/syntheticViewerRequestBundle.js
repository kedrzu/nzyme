// SYNTHETIC fixture — hand-written for assertCloudFrontFunctionCode.test.ts, not a capture of any
// real deployed function. It reproduces the shape of a Babel+terser CloudFront viewer-request
// bundle over an invented edge function; that test's doc comment lists the constructs it has to
// carry. Left unminified on purpose so a reviewer can read it — the AST-level check this feeds does
// not care about whitespace. The one deliberate bug is the `.toSorted()` call.
"use strict";

function arrayLikeToArray(source, length) {
    if (length == null || length > source.length) {
        length = source.length;
    }
    var copy = new Array(length);
    for (var i = 0; i < length; i++) {
        copy[i] = source[i];
    }
    return copy;
}

function unwrapIterable(source, length) {
    if (!source) {
        return;
    }
    if (typeof source === "string") {
        return arrayLikeToArray(source, length);
    }
    var tag = {}.toString.call(source).slice(8, -1);
    if (tag === "Object" && source.constructor) {
        tag = source.constructor.name;
    }
    if (tag === "Map" || tag === "Set") {
        return Array.from(source);
    }
    if (tag === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(tag)) {
        return arrayLikeToArray(source, length);
    }
}

function iterate(source) {
    var it = (typeof Symbol !== "undefined" && source[Symbol.iterator]) || source["@@iterator"];
    if (!it) {
        if (Array.isArray(source) || (it = unwrapIterable(source))) {
            if (it) {
                source = it;
            }
            var index = 0;
            var noop = function () {};
            return {
                s: noop,
                n: function () {
                    return index >= source.length ? { done: true } : { done: false, value: source[index++] };
                },
                e: function (error) {
                    throw error;
                },
                f: noop,
            };
        }
        throw new TypeError("Invalid attempt to iterate a non-iterable instance.");
    }
    var normalCompletion = true;
    var threw = false;
    var thrownError;
    return {
        s: function () {
            it = it.call(source);
        },
        n: function () {
            var step = it.next();
            normalCompletion = step.done;
            return step;
        },
        e: function (error) {
            threw = true;
            thrownError = error;
        },
        f: function () {
            try {
                if (!normalCompletion && it.return != null) {
                    it.return();
                }
            } finally {
                if (threw) {
                    throw thrownError;
                }
            }
        },
    };
}

var SUPPORTED_LANGUAGES = ["en", "fr", "de"];

function parseAcceptLanguage(header) {
    if (!header) {
        return [];
    }
    return header
        .split(",")
        .map(function (part) {
            var bits = part.trim().split(";q=");
            var tag = bits[0];
            var quality = bits[1] !== undefined ? Number.parseFloat(bits[1]) : 1;
            return { tag: tag, quality: Number.isNaN(quality) ? 0 : quality };
        })
        .toSorted(function (a, b) {
            return b.quality - a.quality;
        });
}

function pickLanguage(header) {
    var entries = parseAcceptLanguage(header);
    var it = iterate(entries);
    var step;
    try {
        for (it.s(); !(step = it.n()).done; ) {
            var lang = step.value.tag.split("-")[0].toLowerCase();
            if (SUPPORTED_LANGUAGES.includes(lang)) {
                return lang;
            }
        }
    } catch (error) {
        it.e(error);
    } finally {
        it.f();
    }
    return "en";
}

function isAssetPath(uri) {
    return /\.[a-z0-9]+$/i.test(uri);
}

function rebuildQuery(query) {
    var parts = [];
    var keys = Object.keys(query || {});
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var entry = query[key];
        if (entry && entry.value !== undefined) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(entry.value)}`);
        }
    }
    return parts.length ? "?" + parts.join("&") : "";
}

function handler(event) {
    var request = event.request;
    request.uri = request.uri.toLowerCase();

    if (isAssetPath(request.uri)) {
        return request;
    }

    var acceptLanguageHeader =
        request.headers && request.headers["accept-language"] && request.headers["accept-language"].value;
    var language = pickLanguage(acceptLanguageHeader);
    var location = `/${language}${request.uri}${rebuildQuery(request.querystring)}`;

    return {
        statusCode: 302,
        statusDescription: "Found",
        headers: { location: { value: location } },
    };
}

global.handler = handler;
