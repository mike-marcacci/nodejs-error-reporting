/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Middleware, Request, Response} from 'koa';

import {ErrorMessage} from '../classes/error-message';
import {Configuration} from '../configuration';
import {RequestHandler} from '../google-apis/auth-client';
import {populateErrorMessage} from '../populate-error-message';
import {koaRequestInformationExtractor} from '../request-extractors/koa';

type KoaContext = {request: Request; response: Response};
type KoaNext = {};

/**
 * The koaErrorHandler should be placed at the beginning of the koa middleware
 * stack and should catch the awaited output of the request handling chain. The
 * Koa error handler returns the actual error handler which will be used in the
 * request chain handling and this function corresponds to the format given in:
 * https://github.com/koajs/koa/wiki/Error-Handling.
 * @function koaErrorHandler
 * @param {AuthClient} - The API client instance to report errors to Stackdriver
 * @param {NormalizedConfigurationVariables} - The application configuration
 * @returns {Function} - The function used to catch errors yielded by downstream
 *  request handlers.
 */
export function koaErrorHandler(client: RequestHandler, config: Configuration) {
  /**
   * The actual error handler for the Koa plugin attempts to await the results
   * of downstream request handlers and will attempt to catch errors emitted by
   * these handlers.
   * @param {Object} ctx - the result of the request handlers to await
   * @param {Function} next - the result of the request handlers to await
   * @returns {Undefined} does not return anything
   */

  const middleware = async (ctx: KoaContext, next: KoaNext) => {
    const svc = config.getServiceContext();

    try {
      await next;
    } catch (err) {
      const em = new ErrorMessage()
        .consumeRequestInformation(
          koaRequestInformationExtractor(ctx.request, ctx.response)
        )
        .setServiceContext(svc.service, svc.version);

      populateErrorMessage(err, em);

      client.sendError(em);
    }
  };

  return function(this: KoaContext, arg1: KoaContext|KoaNext, arg2?: KoaNext) {
    const next = arg2 ? arg2 : arg1;
    const ctx = arg2 ? arg1 as KoaContext : this;

    const result = middleware(ctx, next) as {} as {next: KoaNext};

    // Make our result look like a generator for Koa1
    let done = false;
    result.next = () => {
      if (done) {
        return {done};
      }

      done = true;
      return {
        done,
        value: middleware(this, arg1),
      };
    };

    return result;
  };
}
