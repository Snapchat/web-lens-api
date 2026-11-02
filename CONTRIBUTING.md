# Contributing to Web Lens API

Thank you for your interest in Web Lens API. We welcome community contributions and appreciate your time and effort in helping improve the project. Before getting started, please take a moment to review these guidelines.

## 1. [Code of Conduct](./CODE_OF_CONDUCT.md)

We want this project to be a welcoming space for everyone. By contributing, you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md) and help keep the community respectful and inclusive.

## 2. How to Contribute

We welcome contributions in various forms, including:

- Bug fixes
- Documentation and example improvements
- Tests and performance optimizations

If you would like to add a feature or change the public API, please open a GitHub issue to discuss the proposal with the maintainers before starting work.

To contribute, follow these steps:

- **Fork** the repository and create a new branch.
- **Make your changes**, following the existing coding style and keeping the change focused.
- **Run the checks** before submitting: `npm ci`, `npm run lint`, `npm run typecheck`, and `npm test`. If you change an example, check that it works as intended.
- **Submit a pull request (PR)** with a clear description of the change, any related issue, and the tests you ran.
- A maintainer will review your PR and may suggest changes. The maintainers decide whether and when to accept a contribution.

## 3. What to Expect After You Open a PR

Please keep PRs small and focused, and be available to respond to questions or review feedback. A PR may be closed if the change is outside the project's scope or cannot be maintained. We cannot guarantee that every proposed change will be accepted.

## 4. Legal Terms

By submitting a contribution, you represent and warrant that:

- It is your original work, or you have sufficient rights to submit it.
- You grant the Web Lens API maintainers and users the right to use, modify, and distribute it under the MIT license (see LICENSE file); and
- To the extent your contribution is covered by patents, you grant a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to the Web Lens API maintainers and users to make, use, sell, offer for sale, import, and otherwise transfer your contribution as part of the project.

We do not require a Contributor License Agreement (CLA). However, by contributing, you agree to license your submission under terms compatible with the MIT License and to grant the patent rights described above. If your contribution includes third-party code, you are responsible for ensuring it is MIT-compatible and properly attributed.

Where permitted by law, you waive any moral rights in your contribution (e.g., the right to object to modifications). If such rights cannot be waived, you agree not to assert them in a way that interferes with the project's use of your contribution.

## 5. Coding Standards

To maintain a consistent codebase, please follow these guidelines:

- Use the existing coding style and conventions.
- Ensure all code changes are well-documented.
- Write or update tests for new features and bug fixes.
- Avoid introducing unnecessary dependencies.

The Web Lens API is the JavaScript side of a bridge whose other side is built into the Snapchat apps on iOS and Android. A new capability, action or parameter, or any change to what crosses the bridge, needs native support that cannot be added from this repository, so please describe the use case in an [issue](https://github.com/Snapchat/web-lens-api/issues) rather than opening a pull request. 
The public API is everything a Lens can reach: `window.snapchat`, the package's exports, and the types in `dist/types/`. A capability's contract only grows (see [Usage](./README.md#usage) in the README), so we do not accept changes that remove or change existing public behavior.

## 6. Reporting Issues

If you find a bug, please search [existing issues](https://github.com/Snapchat/web-lens-api/issues) before opening a new one. Include the steps to reproduce the problem and the version of Web Lens API you are using.

- **Questions and feature ideas:** Open a [GitHub issue](https://github.com/Snapchat/web-lens-api/issues).
- **Security vulnerabilities:** Follow [SECURITY.md](./SECURITY.md) to report them privately. Do not report vulnerabilities in public issues or pull requests.
