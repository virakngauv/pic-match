/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as gameParticipants from "../gameParticipants.js";
import type * as playerKeys from "../playerKeys.js";
import type * as presence from "../presence.js";
import type * as roomAccess from "../roomAccess.js";
import type * as roomCapacity from "../roomCapacity.js";
import type * as roomCode from "../roomCode.js";
import type * as roomLifecycle from "../roomLifecycle.js";
import type * as roomMembers from "../roomMembers.js";
import type * as rooms from "../rooms.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  gameParticipants: typeof gameParticipants;
  playerKeys: typeof playerKeys;
  presence: typeof presence;
  roomAccess: typeof roomAccess;
  roomCapacity: typeof roomCapacity;
  roomCode: typeof roomCode;
  roomLifecycle: typeof roomLifecycle;
  roomMembers: typeof roomMembers;
  rooms: typeof rooms;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
};
