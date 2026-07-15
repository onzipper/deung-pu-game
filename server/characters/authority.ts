/**
 * Character authority is deliberately separate from a Colyseus transport session.
 *
 * An authenticated character has one stable actor id for the lifetime of the room.
 * Browser/socket sessions may attach, detach, or replace one another without creating
 * another actor. Character Autonomy changes the controller mode of that actor; it does
 * not materialize a bot/worker entity.
 */

export type CharacterAuthorityMode = "manual" | "autonomy";

export interface CharacterActorAuthority {
  readonly actorId: string;
  readonly accountId: string | null;
  readonly characterId: string | null;
  controllerSessionId: string | null;
  mode: CharacterAuthorityMode;
}

export interface BindActorResult {
  actor: CharacterActorAuthority;
  created: boolean;
  previousControllerSessionId: string | null;
}

/** Guests cannot enter Character Autonomy, so their actor only needs connection lifetime identity. */
export function guestActorId(controllerSessionId: string): string {
  return `guest:${controllerSessionId}`;
}

export class CharacterAuthorityRegistry {
  private readonly actors = new Map<string, CharacterActorAuthority>();
  private readonly characterToActor = new Map<string, string>();
  private readonly controllerToActor = new Map<string, string>();

  constructor(private readonly issueActorId: () => string) {}

  bindCharacter(accountId: string, characterId: string, controllerSessionId: string): BindActorResult {
    const existingActorId = this.characterToActor.get(characterId);
    const existing = existingActorId ? this.actors.get(existingActorId) : undefined;
    if (existing && (existing.accountId !== accountId || existing.characterId !== characterId)) {
      throw new Error("character_actor_ownership_conflict");
    }
    const actor = existing ?? {
      // The public schema key is deliberately opaque: never expose a durable character/database id to peers.
      actorId: `actor:${this.issueActorId()}`,
      accountId,
      characterId,
      controllerSessionId: null,
      mode: "manual",
    };
    if (!existing) this.characterToActor.set(characterId, actor.actorId);
    return this.bind(actor, controllerSessionId, existing === undefined);
  }

  bindGuest(controllerSessionId: string): BindActorResult {
    const actorId = guestActorId(controllerSessionId);
    const existing = this.actors.get(actorId);
    return this.bind(existing ?? {
      actorId,
      accountId: null,
      characterId: null,
      controllerSessionId: null,
      mode: "manual",
    }, controllerSessionId, existing === undefined);
  }

  private bind(
    actor: CharacterActorAuthority,
    controllerSessionId: string,
    created: boolean,
  ): BindActorResult {
    const previousControllerSessionId = actor.controllerSessionId;
    if (previousControllerSessionId && previousControllerSessionId !== controllerSessionId) {
      this.controllerToActor.delete(previousControllerSessionId);
    }
    actor.controllerSessionId = controllerSessionId;
    this.actors.set(actor.actorId, actor);
    this.controllerToActor.set(controllerSessionId, actor.actorId);
    return { actor, created, previousControllerSessionId };
  }

  actorForController(controllerSessionId: string): CharacterActorAuthority | null {
    const actorId = this.controllerToActor.get(controllerSessionId);
    return actorId ? this.actors.get(actorId) ?? null : null;
  }

  get(actorId: string): CharacterActorAuthority | null {
    return this.actors.get(actorId) ?? null;
  }

  beginAutonomy(
    actorId: string,
    controllerSessionId: string,
    accountId: string,
    characterId: string,
  ): boolean {
    const actor = this.actors.get(actorId);
    if (
      !actor ||
      actor.controllerSessionId !== controllerSessionId ||
      actor.accountId !== accountId ||
      actor.characterId !== characterId ||
      actor.mode === "autonomy"
    ) {
      return false;
    }
    actor.mode = "autonomy";
    return true;
  }

  endAutonomy(actorId: string): boolean {
    const actor = this.actors.get(actorId);
    if (!actor || actor.mode !== "autonomy") return false;
    actor.mode = "manual";
    return true;
  }

  detachController(controllerSessionId: string): CharacterActorAuthority | null {
    const actor = this.actorForController(controllerSessionId);
    if (!actor || actor.controllerSessionId !== controllerSessionId) return null;
    this.controllerToActor.delete(controllerSessionId);
    actor.controllerSessionId = null;
    return actor;
  }

  removeActor(actorId: string): CharacterActorAuthority | null {
    const actor = this.actors.get(actorId);
    if (!actor) return null;
    if (actor.controllerSessionId) this.controllerToActor.delete(actor.controllerSessionId);
    if (actor.characterId) this.characterToActor.delete(actor.characterId);
    this.actors.delete(actorId);
    return actor;
  }
}
