import * as http from 'http'
import * as httpProxy from 'http-proxy'

const proxy = httpProxy.createProxyServer()

http.createServer((req, res) => {
  proxy.web(req, res, {
    target: Math.random() < 0.5 ?
      'http://test-env.hollowverse.com' :
      'http://prod-env.hollowverse.com',
  })
}).listen(8080)
