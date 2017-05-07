declare module 'http-proxy' {
  interface ProxyServer {
    web: (req: any, res: any, options: any) => string
  }

  export function createProxyServer(): ProxyServer
}
