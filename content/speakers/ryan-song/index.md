---
{
  "name": "Ryan Song",
  "profession": "Staff Test Engineer at Iterable",
  "avatar": "/images/brand/pnsqc-logo.jpg",
  "linkedin": "",
  "homepage": ""
}
---
Ryan Song is a Staff Test Engineer at Iterable with over 10 years of experience in the quality engineering field. He has contributed to projects across a wide range of environments-from startups and federal/defense sectors to Fortune 50 enterprises. Ryan is passionate about automation testing and continuous integration/continuous deployment (CI/CD), with a strong focus on system optimization and operations research. He holds a degree in Industrial and Systems Engineering from Texas A&M University and is currently based in Los Angeles.

**Hackathon week:**

During Iterable's hackathon week, our quality engineering team explored whether a faster, more reliable alternative to Cypress could meet our growing testing needs. Cypress had served us well, but as our codebase expanded, we faced slower execution times for large test suites and recurring memory leaks that disrupted CI pipelines. Playwright quickly emerged as the top candidate thanks to its modern architecture, native parallel execution, robust cross-browser support, and strong community. To test its potential, we built a representative set of tests, ran them alongside Cypress, and tracked execution speed and memory usage. The results were clear: Playwright consistently ran faster, used fewer resources, and produced more stable results. This hackathon project provided the technical evidence and team confidence needed to form the cornerstone of our migration plan and begin a strategic, phased transition.

Figure 1 Example of Cypress out of memory issue

**Introduction of the migration:**

Our transition from Cypress to Playwright is a deliberate, organization-wide effort to modernize our end-to-end testing framework, improve test performance, and reduce long-term maintenance costs. Cypress served us well for years with its developer-friendly syntax and ease of integration, but as our application and test coverage grew, we began encountering slower execution times, higher resource usage, and recurring memory leaks that affected CI stability. This migration guide is designed to support developers of all experience levels through a structured, practical approach. Migrating to a new framework is not just a technical change-it requires planning, shared understanding, and consistent best practices to ensure long-term success.

**Our approach spans five key areas:**
