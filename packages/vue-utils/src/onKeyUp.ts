import { onMounted, onUnmounted } from 'vue';

interface KeyConfig {
    code: number;
    alternative?: string;
}

type Key = 'ArrowLeft' | 'ArrowRight' | 'Enter' | 'Escape';
type KeyCallback = (e: KeyboardEvent) => void;

const keyConfigs: Record<Key, KeyConfig> = {
    Escape: {
        code: 27,
        alternative: 'Esc',
    },
    Enter: {
        code: 13,
    },
    ArrowLeft: {
        code: 37,
    },
    ArrowRight: {
        code: 39,
    },
};

/**
 *
 */
export function onKeyUp(key: Key | Key[], callback: KeyCallback): void;
/**
 *
 */
export function onKeyUp(callback: KeyCallback): void;
/**
 *
 */
export function onKeyUp(keyOrCallback: Key | Key[] | KeyCallback, callback?: KeyCallback) {
    if (typeof keyOrCallback === 'function') {
        callback = keyOrCallback;
    } else {
        const keys = typeof keyOrCallback === 'string' ? [keyOrCallback] : keyOrCallback;
        const originalCallback = callback;

        callback = e => {
            for (const key of keys) {
                if (isMatchingKey(e, key)) {
                    originalCallback!(e);
                    return;
                }
            }
        };
    }

    onMounted(() => {
        document.addEventListener('keyup', callback);
    });

    onUnmounted(() => {
        document.removeEventListener('keyup', callback);
    });
}

function isMatchingKey(event: KeyboardEvent, key: Key) {
    const keyConfig = keyConfigs[key];

    if ('key' in event) {
        return event.key === key || (keyConfig.alternative != null && event.key === keyConfig.alternative);
    } else {
        return (event as KeyboardEvent).keyCode === keyConfig.code;
    }
}
