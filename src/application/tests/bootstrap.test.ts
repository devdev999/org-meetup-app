import { expect, test } from "vitest";
import { ministryA, ministryB } from "./fixtures";
import { harness } from "./harness";

const h = harness();

test("bootstrap seeds the first Organisation, which then appears as a sign-in option", async () => {
  await h.app.bootstrap(ministryA);

  expect(await h.app.signInOptions()).toEqual([{ slug: "ministry-a", name: "Ministry A" }]);
});

test("running bootstrap again changes nothing", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(ministryA);

  expect(await h.app.signInOptions()).toEqual([{ slug: "ministry-a", name: "Ministry A" }]);
});

test("bootstrap of a second Organisation adds a second sign-in option, in name order", async () => {
  await h.app.bootstrap(ministryB);
  await h.app.bootstrap(ministryA);

  expect(await h.app.signInOptions()).toEqual([
    { slug: "ministry-a", name: "Ministry A" },
    { slug: "ministry-b", name: "Ministry B" },
  ]);
});
