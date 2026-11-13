# recipes-external

A recipe pack for [puddlerouter](https://github.com/puddle-works/puddlerouter):
GitHub phrasings that it answers from `@webframp/github` without calling
Claude. It is published as `@puddleworks/recipes-external` (public) with the
label `puddlerouter-recipe`, so `@puddleworks/recipes-sync` finds it.

## Recipes

| Workflow | Matches | Runs | Answers |
|---|---|---|---|
| `workflow-github-open-issue-count.yaml` | "how many open issues does owner/name have?" | `@webframp/github` `get_repo_info` | "puddlerouter has 6 open issues." |

The count is `issues.totalCount` from `gh repo view`: open issues only (pull
requests are counted apart), and exact, not cut off at a page.

## What a desk needs

- A model definition named `github` of type `@webframp/github`.
- `@webframp/github get_repo_info` under `reads:` in the desk's
  `puddlerouter.yaml`. Without it the router treats the recipe as a write and
  asks before it runs. Only that file can say a method only reads; a pack
  cannot.

```yaml
reads:
  - "@webframp/github get_repo_info"
```

## How a recipe is stored

Each recipe is a workflow with one `model_method` step. Its
`puddlerouterRecipe` tag is JSON with `id`, `pattern` (a regex that must match
the whole turn), `extension` (the extension that holds the model type),
`dataName`, `inputs` (which regex capture feeds which input, and its shape:
`int`, `repo` or `word`), `template`, and `source`. puddlerouter takes the
method and fixed inputs from the step.

`source` links the recipe to the Capture request it answers. Its `url` is the
request's page on the Capture desk that agreed it, on `127.0.0.1`, so it opens
only on that machine; the engine accepts https or a local address there.

Running the workflow by hand gives the same data:

```sh
swamp workflow run @puddleworks/recipes-external-github-open-issue-count --input repo=puddle-works/puddlerouter
```

## Checks

```sh
make test
make contracts-check
make guardrails-check
make publish VISIBILITY=public DRY_RUN=1   # stops after the dry run
```

`puddle.mk` fetches the checks from the puddle-tooling release named by
`TOOLING_REF` (default `v0.1.1`). Move to a newer release by changing it there
and the `@vX.Y.Z` and `tooling-ref` in `ci.yml` together.
