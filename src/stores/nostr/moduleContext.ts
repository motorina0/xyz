export interface NostrStoreModuleContext<
  Runtime extends Record<string, unknown> = Record<string, unknown>,
  Actions extends Record<string, (...args: any[]) => any> = Record<string, (...args: any[]) => any>
> {
  runtime: Runtime;
  actions: Actions;
}

