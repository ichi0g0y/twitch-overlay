import { createContext } from "react";
import type { WorkspaceRenderContextValue } from "./types";

export const WORKSPACE_RENDER_CONTEXT =
  createContext<WorkspaceRenderContextValue | null>(null);
