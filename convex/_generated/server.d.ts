type ConvexHandlerConfig = {
  args: Record<string, unknown>;
  handler: (ctx: any, args: any) => unknown;
};

export declare function query(config: ConvexHandlerConfig): any;
export declare function mutation(config: ConvexHandlerConfig): any;
