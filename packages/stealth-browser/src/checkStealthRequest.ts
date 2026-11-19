import type { CdpRequest } from './CdpTypes.js';
import { ISOLATED_WORLD_NAME } from './createIsolatedWorlds.js';
import type { ClientWorld, IsolatedCall, IsolatedWorlds } from './createIsolatedWorlds.js';

/** What the proxy does with a request that passed its other checks. */
export type StealthDecision =
    /** Send it to the browser as given here (params may be rebuilt), on `sessionId` when set. */
    | { type: 'forward'; method: string; params: Record<string, unknown>; sessionId?: string }
    /** Run it in an isolated world: the proxy's, or the client's own it named (`IsolatedWorlds.send`). */
    | { type: 'isolate'; call: IsolatedCall }
    /** Create the client's own isolated world on `sessionId` and remember it (`IsolatedWorlds.createClientWorld`). */
    | { type: 'createWorld'; world: ClientWorld; sessionId: string }
    /** Answer the client with `result` without touching the browser. */
    | { type: 'reply'; result: object }
    /** Answer the client with a CDP error carrying `message`. */
    | { type: 'reject'; message: string };

/**
 * The Runtime methods a client may call, besides `enable` and `disable`, which the proxy answers itself: evaluating
 * and calling functions (both sent to an isolated world), and what works on objects those returned (properties,
 * awaiting, releasing), plus resuming a target held for the debugger. The rest is refused: `compileScript`,
 * `runScript` and `queryObjects` act in a context the client names by id, which may be the page's own world; a
 * binding (`addBinding`) exists for page code to call.
 */
const RUNTIME_METHODS = new Set([
    'evaluate',
    'callFunctionOn',
    'getProperties',
    'awaitPromise',
    'releaseObject',
    'releaseObjectGroup',
    'runIfWaitingForDebugger',
]);

/** Refused because they let a client step around the per-message checks or reach the proxy's own state; with why. */
const REFUSED_METHODS: Record<string, string> = {
    'Target.sendMessageToTarget': 'use a flat session: Target.attachToTarget sends every command through these checks',
    'Target.exposeDevToolsProtocol': 'it gives page code a binding into CDP',
    'Target.attachToBrowserTarget': "the browser target's session is the proxy's",
    'Target.autoAttachRelated':
        "its sessions could not be told apart from the proxy's own; use Target.setAutoAttach on a session",
    'Target.createBrowserContext': "browser contexts are the proxy's",
    'Target.disposeBrowserContext': "browser contexts are the proxy's",
    'Target.setRemoteLocations': 'it changes target discovery for every client',
    'Target.openDevTools': 'a DevTools window drives the browser past these checks',
    'Target.getDevToolsTarget': 'a DevTools window drives the browser past these checks',
    'Browser.close': "the browser's lifetime is the proxy's",
    'Browser.crash': "the browser's lifetime is the proxy's",
    'Browser.crashGpuProcess': "the browser's lifetime is the proxy's",
};

/**
 * Applies the proxy's stealth rules to a request that passed the session, target and policy checks. Page scripts must
 * never observe a client's code: an enabled Runtime, Console or Debugger domain is measurable from the page (an
 * Error logged while Runtime is enabled has its stack formatted, which calls the page's `Error.prepareStackTrace`), so
 * the proxy answers their `enable` and `disable` itself and never sends them; every evaluation, resolved node and init
 * script goes to an isolated world (`ISOLATED_WORLD_NAME`, or one the client created itself), never the page's own;
 * Runtime is open only by method (`RUNTIME_METHODS`), Console and Debugger not at all. The user agent is the proxy's
 * (`createBrandOverride`): Emulation's and Network's `setUserAgentOverride` are refused, as a client's override would
 * replace the brand while its session lives. A `javascript:` URL is refused where it would be navigated to, as it runs
 * in the page's own world. A few more methods are refused because they step around the per-message checks or reach the
 * proxy's own state (`REFUSED_METHODS`).
 * @__NO_SIDE_EFFECTS__
 */
export function checkStealthRequest(
    request: CdpRequest,
    worlds: Pick<IsolatedWorlds, 'findClientWorld'>,
): StealthDecision {
    const { method, params, sessionId } = request;
    const domain = method.slice(0, method.indexOf('.'));
    if (Object.hasOwn(REFUSED_METHODS, method)) {
        return reject(`${method} is not allowed: ${REFUSED_METHODS[method]}`);
    }

    switch (method) {
        case 'Runtime.enable':
        case 'Runtime.disable':
        case 'Console.enable':
        case 'Console.disable':
        case 'Debugger.enable':
        case 'Debugger.disable':
            return { type: 'reply', result: {} };
        case 'Runtime.evaluate':
            return checkIsolated(request, 'contextId', worlds);
        case 'Runtime.callFunctionOn':
        case 'DOM.resolveNode':
            return checkIsolated(request, 'executionContextId', worlds);
        case 'Page.createIsolatedWorld':
            return checkCreateWorld(request);
        case 'Runtime.addBinding':
            // A binding exists for page code to call; one in an isolated world never could, so it would do nothing.
            return reject(`${method} is not allowed: page code must not call the client's functions`);
        case 'Page.addScriptToEvaluateOnLoad':
            // Deprecated and world-less: the page's own world would run it.
            return reject(`${method} is not allowed: use Page.addScriptToEvaluateOnNewDocument`);
        case 'Page.addScriptToEvaluateOnNewDocument':
            return forward(request, {
                ...params,
                worldName:
                    typeof params['worldName'] === 'string' && params['worldName'] !== ''
                        ? params['worldName']
                        : ISOLATED_WORLD_NAME,
            });
        case 'Emulation.setUserAgentOverride':
        case 'Network.setUserAgentOverride':
            return reject(`${method} is not allowed: the browser's identity is set by the proxy`);
        case 'Page.navigate':
        case 'Target.createTarget':
            return isScriptUrl(params['url'])
                ? reject(`${method}: a javascript: URL would run in the page's own world`)
                : forward(request);
    }

    switch (domain) {
        case 'Runtime':
            return RUNTIME_METHODS.has(method.slice(domain.length + 1))
                ? forward(request)
                : reject(`${method} is not allowed: page scripts could observe it`);
        case 'Console':
        case 'Debugger':
            return reject(`${method} is not allowed: page scripts could observe it`);
        case 'Fetch':
            // On the browser target, interception pauses every page's requests, which no client is told about.
            return sessionId == null ? reject(`${method} must be sent on a session of a page`) : forward(request);
        default:
            return forward(request);
    }
}

/**
 * A call that runs code or creates an object in an execution context: the proxy always picks the context, never
 * forwarding a number. A context id is not proof of a world: Chrome reuses ids across renderer processes, so an id an
 * isolated world had can name the page's own world after a cross-site navigation. So with no context named the call
 * goes to the proxy's isolated world, and an id the client was given for a world it created stands for that world,
 * which is created again by frame and name; any other id is refused. A call on an object (`Runtime.callFunctionOn` with
 * `objectId`) runs where the object lives: a client calls functions on objects its own isolated calls returned, and an
 * object a page event carries lives in the page's world, which a client set on reaching it can reach through the DOM
 * anyway.
 */
function checkIsolated(
    request: CdpRequest,
    contextParam: IsolatedCall['contextParam'],
    worlds: Pick<IsolatedWorlds, 'findClientWorld'>,
): StealthDecision {
    const { method, sessionId } = request;
    if (sessionId == null) {
        return reject(`${method} must be sent on a session of a page`);
    }
    const { [contextParam]: contextId, ...params } = request.params;
    const otherParam = contextParam === 'contextId' ? 'executionContextId' : 'contextId';
    if (params[otherParam] != null || params['uniqueContextId'] != null) {
        return reject(`${method}: only ${contextParam} can name an execution context`);
    }
    if (contextId == null) {
        return params['objectId'] != null && method === 'Runtime.callFunctionOn'
            ? forward(request)
            : { type: 'isolate', call: { method, params, sessionId, contextParam } };
    }
    const world = typeof contextId === 'number' ? worlds.findClientWorld(sessionId, contextId) : undefined;
    if (world == null || params['objectId'] != null) {
        return reject(
            `${method}: code runs only in isolated worlds, so ${contextParam} must name one you created ` +
                'with Page.createIsolatedWorld',
        );
    }
    return { type: 'isolate', call: { method, params, sessionId, contextParam, world } };
}

/**
 * A client's own isolated world, rebuilt from what it is recorded by. A name is required: Chrome creates a new world
 * for each call with an empty name, which a later call by context id could not be sent to again.
 */
function checkCreateWorld(request: CdpRequest): StealthDecision {
    const { method, params, sessionId } = request;
    const { frameId, worldName } = params;
    if (sessionId == null) {
        return reject(`${method} must be sent on a session of a page`);
    }
    if (typeof frameId !== 'string' || typeof worldName !== 'string' || worldName === '') {
        return reject(`${method}: name the world and its frame`);
    }
    return {
        type: 'createWorld',
        world: { frameId, worldName, grantUniveralAccess: params['grantUniveralAccess'] === true },
        sessionId,
    };
}

/** Whether a URL is a `javascript:` one, as the browser would parse it: case and surrounding blanks do not matter. */
function isScriptUrl(url: unknown) {
    return typeof url === 'string' && URL.parse(url)?.protocol === 'javascript:';
}

function forward(request: CdpRequest, params = request.params): StealthDecision {
    return request.sessionId == null
        ? { type: 'forward', method: request.method, params }
        : { type: 'forward', method: request.method, params, sessionId: request.sessionId };
}

function reject(message: string): StealthDecision {
    return { type: 'reject', message };
}
