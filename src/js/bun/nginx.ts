type Options = import("bun:nginx").NginxOptions;
type ProviderOptions = import("bun:nginx").NginxProviderOptions;
type OperationOptions = import("bun:nginx").NginxOperationOptions;
type Info = import("bun:nginx").NginxInfo;
type Status = import("bun:nginx").NginxStatus;
type Validation = import("bun:nginx").NginxValidation;
type Closed = import("bun:nginx").NginxClosed;

const native = $newRustFunction("nginx/bindings.rs", "jsNginx", 3) as (
  action: string,
  handle: object | undefined,
  options?: object,
) => Promise<any>;
const construction = {};

export class Nginx {
  #handle: object | undefined = undefined;

  constructor(handle: object, token: object) {
    if (token !== construction) throw $ERR_INVALID_ARG_VALUE("constructor", token, "Use Nginx.create(options)");
    this.#handle = handle;
  }

  static async create(options: Options): Promise<Nginx> {
    return new Nginx(await native("create", undefined, options), construction);
  }

  static probe(options?: ProviderOptions): Promise<Info> {
    return native("probe", undefined, options);
  }

  probe(options?: OperationOptions): Promise<Info> {
    return native("info", this.#handle, options);
  }
  validate(options?: OperationOptions): Promise<Validation> {
    return native("validate", this.#handle, options);
  }
  start(options?: OperationOptions): Promise<Status> {
    return native("start", this.#handle, options);
  }
  reload(options?: OperationOptions): Promise<Status> {
    return native("reload", this.#handle, options);
  }
  quit(options?: OperationOptions): Promise<Status> {
    return native("quit", this.#handle, options);
  }
  status(options?: OperationOptions): Promise<Status> {
    return native("status", this.#handle, options);
  }
  close(options?: OperationOptions): Promise<Closed> {
    return native("close", this.#handle, options);
  }
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

export const create = Nginx.create;
export const probe = Nginx.probe;
