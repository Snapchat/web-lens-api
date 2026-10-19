export interface BridgeMessage {
    readonly uri: string;
    readonly params: Record<string, unknown>;
}
export type Transport = (message: BridgeMessage) => Promise<unknown>;
interface IosBridge {
    postMessage(message: BridgeMessage): unknown;
}
interface AndroidBridge {
    postMessage(serialized: string): void;
    addEventListener(type: 'message', listener: (event: {
        data: string;
    }) => void): void;
}
/** The slice of the host window the API touches; loose on purpose so node harnesses can fake it. */
export interface HostGlobal {
    webkit?: {
        messageHandlers?: {
            snapWebLensBridge?: IosBridge;
        };
    };
    snapWebLensBridge?: AndroidBridge;
    location?: {
        protocol?: string;
        hostname?: string;
    };
    addEventListener?: (type: string, listener: (event: any) => void) => void;
    dispatchEvent?: (event: Event) => boolean;
    snapchat?: unknown;
    SnapSDK?: unknown;
}
export declare function getGlobal(): HostGlobal;
export interface SelectedTransport {
    transport: Transport;
    isStub: boolean;
}
export declare function selectTransport(global: HostGlobal, makeStub: () => Transport): SelectedTransport;
export {};
