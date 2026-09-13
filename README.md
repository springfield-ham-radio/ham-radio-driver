# ham-radio-driver

Serial driver that executes HamBench protocol DSL steps: clone read/write, baud switching, and live CAT memory (`catRead` / `catWrite`).

Docs: [Protocol DSL](https://springfield-ham-radio.github.io/ham-radio-docs/developer/protocols/dsl.html) · [Architecture](https://springfield-ham-radio.github.io/ham-radio-docs/developer/architecture.html)

```bash
corepack enable
yarn install
yarn build
```

```typescript
import { RadioDriver } from '@springfield/ham-radio-driver';

const driver = new RadioDriver(radioConfig, logger);
const memory = await driver.readRadio('/dev/ttyUSB0', progressIndicator);
```
