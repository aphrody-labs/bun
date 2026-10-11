# CrOS Source Manifests

The [Repo tool] manages our local checkouts.  See our
[CrOS Source Layout documentation] for much more detailed information.

See the [upstream repo manifest format documentation] for general info on
manifests and its specification.

[TOC]

## Internal->External File Syncing

Some files are automatically synced between the [internal manifest project] and
the [public manifest project].  Changes to these files must not be made in the
public manifest project as they will be automatically clobbered.  It also means
that care must be taken to only include public information in these files to
avoid accidental leaks.

If you're not a Googler and want to update one of these files, then please
[file a bug] instead for assistance.

If you want to update the list of synced files, see the [cros_source recipe].

The current list of files:

* `codesearch-chromiumos.xml`
* `DIR_METADATA`
* `full.xml`
* `README.md`
* `_kernel_upstream.xml`
* `_remotes.xml`

## Official builds

Official builders sync using the `official.xml` manifest which may include
more projects than most developers need or want.

## CQ Support

The CQ does not automatically watch new or all projects.  The list of projects
with CQ coverage is manually maintained in [`~/chromiumos/infra/config/`] in the
[`chromeos_repos.star`] file.

Whenever a new project is added to the manifest, the developer adding it is also
responsible for updating the CQ config.

This is an unfortunate KI with the CQ and is tracked in http://b/206800931.

[`~/chromiumos/infra/config/`]: https://chrome-internal.googlesource.com/chromeos/infra/config
[`chromeos_repos.star`]: https://chrome-internal.googlesource.com/chromeos/infra/config/+/HEAD/chromeos_repos.star

## Local Testing

See the [How do I test a manifest change? FAQ] for more detailed information.

The CQ should provide decent coverage too.

Here is a quick hack method:

*   Edit files in `~/chromiumos/.repo/manifests/`
*   Run `repo sync --no-manifest-update` to use the local manifest files on disk
*   Verify changes
*   Revert changes in `~/chromiumos/.repo/manifests/`

## Groups

One can check out a subset of the manifest using the repo `groups` feature.
This section documents the important groups that we use.

### minilayout

This group is the minimum subset of repos needed to do a full build of Chrome
OS. It doesn't include all of the repos to necessarily test the OS image but
does include all those needed to create an image.

### buildtools

The subset of repos needed to perform release actions i.e. payload generation,
etc. Used by release engineers, TPMs, and Infra team members. Note this group
isn't useful without a checkout of manifest-internal.

### labtools

Tools needed to perform routine lab administrative actions like DUT
re-allocation or lab server management.

## Annotations

List of specific annotations we use:

*   `<project>`
    *   `branch-mode`: `tot`, `pin`, `drop`, `create` (default).
        How the project should be handled when creating a new branch.
        *   `tot`: track the same upstream/revision as the source branch.
        *   `pin`: pin the project to whatever commit it is at in the source
            branch.
        *   `drop`: drop the project from the manifest in the newly created
            branch.
        *   `create` (default): create a new branch for the project.
    *   'bisection-branch'
        Kernel continuous rebase (KCR) uses this annotation to provide the Bisector
        with a branch name for performing bisection. The kernel continuous rebase
        branches can't be directly used for bisection because there is no linear
        history between two KCR rebases.
    *   `branch-suffix` and `no-branch-suffix`. Used to override default branching
        behavior for projects with multiple checkouts. `no-branch-suffix` will
        drop any sort of suffix. `branch-suffix` provides a custom suffix to be
        used for that checkout (note that `branch_util` already prefixes the
        suffix with a `-`, so you shouldn't include one in the annotation).
*   `<remote>`
    *   `public`: `true`, `false` (default). Whether the remote is publicly
        accessible (i.e. external). Currently used by the Manifest Doctor to
        determine which projects to include in external buildspecs
        (see [go/cros-public-buildspecs](go/cros-public-buildspecs)).


[CrOS Source Layout documentation]: https://www.chromium.org/chromium-os/developer-library/reference/development/source-layout/
[cros_source recipe]: https://chromium.googlesource.com/chromiumos/infra/recipes/+/HEAD/recipe_modules/cros_source/api.py
[file a bug]: https://issuetracker.google.com/issues/new?component=1037860&template=1600056
[How do I test a manifest change? FAQ]: https://www.chromium.org/chromium-os/developer-library/reference/development/source-layout/#how-do-i-test-a-manifest-change
[internal manifest project]: https://chrome-internal.googlesource.com/chromeos/manifest-internal
[public manifest project]: https://chromium.googlesource.com/chromiumos/manifest
[Repo tool]: https://gerrit.googlesource.com/git-repo/
[upstream repo manifest format documentation]: https://gerrit.googlesource.com/git-repo/+/HEAD/docs/manifest-format.md
