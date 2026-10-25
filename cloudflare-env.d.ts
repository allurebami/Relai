declare namespace Cloudflare {
  interface Env {
    RELAI_GATEWAY_SECRET?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
