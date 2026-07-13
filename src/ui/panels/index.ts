// Barrel — panel/window framework กลาง (P2-07/P2-11/P2-12 ใช้ร่วมกัน). ดู docs/context/ui.md "Panel framework".

export { PanelProvider, usePanelManager, type PanelManager } from "./PanelContext";
export { Panel, type PanelProps } from "./Panel";
export { useMediaQuery, useIsMobilePanel, PANEL_MOBILE_QUERY } from "./use-media-query";
export {
  INITIAL_PANEL_STACK_STATE,
  PANEL_BASE_Z_INDEX,
  openPanel,
  closePanel,
  closeTopPanel,
  closeAllPanels,
  isPanelOpen,
  topPanelId,
  zIndexOf,
  panelStackReducer,
  type PanelId,
  type PanelStackState,
  type PanelStackAction,
} from "./panel-stack";
