/// <reference types="vite/client" />

import type { AccountWorkbenchBridge } from "../main/preload";

declare global {
  interface Window {
    accountWorkbench?: AccountWorkbenchBridge;
  }
}
