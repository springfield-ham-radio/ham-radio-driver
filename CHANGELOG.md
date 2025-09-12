## <small>1.5.1 (2025-09-12)</small>

* fix: update ReadSegmentExecutor and expression-utils for big-endian support ([d073262](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/d073262))

## 1.5.0 (2025-09-12)

* feat: enhance RadioDriver to support user-specific serial log file paths ([28b1f48](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/28b1f48))

## 1.4.0 (2025-09-12)

* feat: enhance SerialLogger to buffer and group log entries ([617c58b](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/617c58b))
* test: streamline SerialLogger tests and add static methods for data conversion ([d537a48](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/d537a48))

## <small>1.3.1 (2025-09-12)</small>

* fix: remove writeLogFile calls from SerialLogger methods ([87dac01](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/87dac01))

## 1.3.0 (2025-09-11)

* feat: force version bump ([d576949](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/d576949))
* test: update SerialLogger tests to use JSON format and remove MockLogLayer dependency ([27f1793](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/27f1793))
* feature: update SerialLogger to use JSON format for logging ([5fca513](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/5fca513))

## <small>1.2.1 (2025-09-05)</small>

* Merge branch 'renovate/chai-5.x' into 'main' ([1655f57](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/1655f57))
* Merge branch 'renovate/semantic-release-monorepo' into 'main' ([13fb934](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/13fb934))
* Merge branch 'renovate/tsx-4.x' into 'main' ([01506fa](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/01506fa))
* Merge branch 'renovate/yarn-monorepo' into 'main' ([f6847e1](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/f6847e1))
* chore(deps): update dependency @semantic-release/gitlab to v13.2.8 ([a8b1252](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/a8b1252))
* chore(deps): update dependency chai to v5.3.3 ([97e4042](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/97e4042))
* chore(deps): update dependency tsx to v4.20.5 ([c3796c4](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/c3796c4))
* chore(deps): update yarn to v4.9.4 ([344640f](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/344640f))
* build: fix linting errors ([9a21865](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/9a21865))
* fix: add SerialLogger export ([29eb795](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/29eb795))

## 1.2.0 (2025-08-25)

* feat: serial port logging ([978000b](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/978000b))
* Merge branch 'renovate/semantic-release-monorepo' into 'main' ([82d570d](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/82d570d))
* Merge branch 'renovate/yarn-monorepo' into 'main' ([ee8059d](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/ee8059d))
* chore(deps): update dependency @semantic-release/gitlab to v13.2.7 ([61f26db](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/61f26db))
* chore(deps): update yarn to v4.9.3 ([52de69f](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/52de69f))

## <small>1.1.2 (2025-08-18)</small>

* fix: enhance ReadSegmentExecutor with progress tracking for chunk processing ([52c13bf](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/52c13bf))

## <small>1.1.1 (2025-08-18)</small>

* fix: update tsconfig.json to remove test directory from include ([0929e4c](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/0929e4c))

## 1.1.0 (2025-08-17)

* fix: update dependencies ([f3fc562](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/f3fc562))
* chore: add various documentation files for project standards and practices ([c89163b](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/c89163b))
* feat: add .oxlintrc.json configuration file for linting rules and settings ([76f0da1](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/76f0da1))

## <small>1.0.3 (2025-08-08)</small>

* Merge branch 'renovate/oxlint-1.x' into 'main' ([0fcfcda](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/0fcfcda))
* Merge branch 'renovate/oxlint-1.x' into 'main' ([73c7b05](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/73c7b05))
* Merge branch 'renovate/springfield-ham-radio-api-16.x' into 'main' ([3288dee](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/3288dee))
* Merge branch 'renovate/typescript-5.x' into 'main' ([44b2d49](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/44b2d49))
* fix(deps): update dependency @springfield/ham-radio-api to ^16.1.2 ([094bc69](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/094bc69))
* chore(deps): update dependency oxlint to v1.7.0 ([2ef91bb](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/2ef91bb))
* chore(deps): update dependency oxlint to v1.8.0 ([c2f9823](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/c2f9823))
* chore(deps): update dependency typescript to v5.9.2 ([e78cc71](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/e78cc71))

## <small>1.0.2 (2025-07-11)</small>

* Merge branch 'renovate/chai-5.x' into 'main' ([8446a76](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/8446a76))
* Merge branch 'renovate/loglayer-6.x' into 'main' ([77f8ba1](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/77f8ba1))
* fix(deps): update dependency loglayer to ^6.6.0 ([ad50e87](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/ad50e87))
* chore(deps): update dependency chai to v5.2.1 ([f158b90](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/f158b90))

## <small>1.0.1 (2025-07-04)</small>

* Merge branch 'renovate/pin-dependencies' into 'main' ([0cf52c0](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/0cf52c0))
* Merge branch 'renovate/springfield-ham-radio-utils-2.x' into 'main' ([5daa2fc](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/5daa2fc))
* Merge branch 'renovate/yarn-monorepo' into 'main' ([43d6c6d](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/43d6c6d))
* fix(deps): update dependency @springfield/ham-radio-utils to ^2.2.0 ([2ca4315](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/2ca4315))
* chore(deps): pin dependencies ([187ecbf](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/187ecbf))
* chore(deps): update yarn to v4.9.2 ([51c1f55](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/51c1f55))

## 1.0.0 (2025-06-24)

* ci: add GitLab CI configuration for build and release processes ([7f37874](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/7f37874))
* ci: enhance GitLab CI configuration with install stage ([bf29fec](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/bf29fec))
* feat: initial release ([c7f72af](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/c7f72af))
* chore: add license information to package.json ([04c7292](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/04c7292))
* chore: add ui logger ([96287e0](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/96287e0))
* chore: get read radio memory working ([10decdc](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/10decdc))
* chore: initial commit ([ae109fd](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/ae109fd))
* chore: update dependencies and enhance Baofeng UV-5R configuration ([b8deb00](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/b8deb00))
* refactor: mode the ui logger to the ham-radio-utils module and fix the integration tests ([cf78cfa](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/cf78cfa))
* refactor: update radio configuration and testing structure ([32a4351](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/32a4351))
* Initial commit ([5b9a028](https://gitlab.com/springfield-ham-radio/app/ham-radio-driver/commit/5b9a028))
