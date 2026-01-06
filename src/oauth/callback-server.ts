import * as http from 'http';
import * as url from 'url';

export class OAuthCallbackServer {
  private server: http.Server | null = null;
  private port: number;
  private resolvePromise: ((code: string) => void) | null = null;
  private rejectPromise: ((error: Error) => void) | null = null;

  constructor(port: number = 8080) {
    this.port = port;
  }

  getPort(): number {
    return this.port;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        
        if (parsedUrl.pathname === '/oauth/callback') {
          const code = parsedUrl.query.code as string;
          const error = parsedUrl.query.error as string;
          
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>OAuth Error</title></head>
                <body>
                  <h1>Authentication Error</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window and try again.</p>
                </body>
              </html>
            `);
            
            if (this.rejectPromise) {
              this.rejectPromise(new Error(`OAuth error: ${error}`));
            }
          } else if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Authentication Successful</title></head>
                <body>
                  <h1>Authentication Successful!</h1>
                  <p>You can close this window and return to VS Code.</p>
                  <script>
                    // Copy the code to clipboard if possible
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText('${code}');
                    }
                  </script>
                </body>
              </html>
            `);
            
            if (this.resolvePromise) {
              this.resolvePromise(code);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>OAuth Error</title></head>
                <body>
                  <h1>Authentication Error</h1>
                  <p>No authorization code received.</p>
                  <p>You can close this window and try again.</p>
                </body>
              </html>
            `);
            
            if (this.rejectPromise) {
              this.rejectPromise(new Error('No authorization code received'));
            }
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Not Found</title></head>
              <body>
                <h1>404 - Not Found</h1>
                <p>This is the CipherMate OAuth callback server.</p>
              </body>
            </html>
          `);
        }
      });

      this.server.listen(this.port, 'localhost', () => {
        console.log(`OAuth callback server listening on http://localhost:${this.port}`);
        resolve();
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          // Port is already in use, try next port
          this.port++;
          this.start().then(resolve).catch(reject);
        } else {
          reject(error);
        }
      });
    });
  }

  async waitForCallback(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
