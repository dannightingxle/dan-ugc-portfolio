import { z } from "zod";
import { editsApi, NotFound } from "../../../hub/_lib/edits/request";
import { getTodos, saveTodos } from "../../../hub/_lib/todos/data";
import { MAX_TODOS, REPEATS, type Todo } from "../../../hub/_lib/todos/types";

/* Your to-dos: GET the list, POST a new one, PATCH one's fields (the page works
   out what ticking, submitting or approving changes), DELETE ?id= one, or
   DELETE ?projectId= a job's open one-off to-dos all at once (a pile set-up
   added, say). PUT { todos } puts back ones just cleared (Undo). */

const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const time = z.union([z.literal(""), z.string().datetime()]);
const Fields = z.object({
  text: z.string().trim().min(1, "Write the to-do first.").max(300),
  projectId: z.string().max(80),
  repeat: z.enum(REPEATS),
  due: day,
  count: z.number().int().min(1).max(99).nullable(),
  left: z.number().int().min(0).max(99).nullable(),
  submittedAt: time,
  doneAt: time,
  prevDue: day,
});

export async function GET(request: Request) {
  return editsApi(request, null, async ({ user }) => ({ todos: await getTodos(user.id) }), "todos");
}

export async function POST(request: Request) {
  const New = Fields.pick({ text: true, projectId: true, repeat: true, due: true, count: true }).partial({ projectId: true, repeat: true, due: true, count: true });
  return editsApi(
    request,
    New,
    async ({ user, body }) => {
      const todos = await getTodos(user.id);
      if (todos.length >= MAX_TODOS) throw new NotFound("That's a lot of to-dos - tick some off first.");
      const todo: Todo = {
        id: crypto.randomUUID(),
        text: body.text,
        projectId: body.projectId ?? "",
        repeat: body.repeat ?? "",
        due: body.due ?? "",
        count: body.count ?? null,
        left: body.count ?? null,
        submittedAt: "",
        doneAt: "",
        prevDue: "",
        createdAt: new Date().toISOString(),
      };
      return { todo, todos: await saveTodos(user.id, [todo, ...todos]) };
    },
    "todos",
  );
}

export async function PATCH(request: Request) {
  return editsApi(
    request,
    Fields.partial().extend({ id: z.string().max(40) }),
    async ({ user, body }) => {
      const { id, ...patch } = body;
      const todos = await getTodos(user.id);
      if (!todos.some((t) => t.id === id)) throw new NotFound("That to-do isn't there any more.");
      return { todos: await saveTodos(user.id, todos.map((t) => (t.id === id ? { ...t, ...patch } : t))) };
    },
    "todos",
  );
}

/** A one-off that's still to do (not ticked, not sent off for approval). */
const openOneOff = (t: Todo) => !t.repeat && !t.doneAt && !t.submittedAt;

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const projectId = params.get("projectId");
  return editsApi(
    request,
    null,
    async ({ user }) => {
      const todos = await getTodos(user.id);
      if (projectId) {
        const cleared = todos.filter((t) => t.projectId === projectId && openOneOff(t));
        return { cleared, todos: await saveTodos(user.id, todos.filter((t) => !cleared.includes(t))) };
      }
      return { todos: await saveTodos(user.id, todos.filter((t) => t.id !== id)) };
    },
    "todos",
  );
}

const Restore = z.object({
  todos: z.array(Fields.extend({ id: z.string().max(40), createdAt: z.string().max(40) })).max(MAX_TODOS),
});

export async function PUT(request: Request) {
  return editsApi(
    request,
    Restore,
    async ({ user, body }) => {
      const todos = await getTodos(user.id);
      const back = (body.todos as Todo[]).filter((t) => !todos.some((x) => x.id === t.id));
      return { todos: await saveTodos(user.id, [...todos, ...back].slice(0, MAX_TODOS)) };
    },
    "todos",
  );
}
