import { SlitherGameState, SlitherInputState } from "./types";

export type SlitherNetworkMode = "local-bots" | "websocket-ready";

export type SlitherNetworkAdapter = {
  mode: SlitherNetworkMode;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendInput: (input: SlitherInputState) => void;
  getRemoteState: () => SlitherGameState | null;
};

export function createLocalNetworkAdapter(): SlitherNetworkAdapter {
  return {
    mode: "local-bots",
    async connect() {
      return Promise.resolve();
    },
    disconnect() {},
    sendInput() {},
    getRemoteState() {
      return null;
    }
  };
}
