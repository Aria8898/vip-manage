/// <reference types="vite/client" />

declare module "virtual:app-root" {
  import type { ComponentType } from "react";

  const App: ComponentType;
  export default App;
}
