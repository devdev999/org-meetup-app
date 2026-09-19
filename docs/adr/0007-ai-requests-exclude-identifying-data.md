# AI requests exclude identifying data

Superseded by [ADR 0009](0009-ai-input-privacy-deferred-for-mvp.md).

AI requests exclude Member names, emails, Departments and Sites, including identifying information in Interest text, questions, conversation history, tool data and creation text. The same boundary applies to canonicalisation, clustering, Scout and automatic Interest extraction because a configurable endpoint does not establish permission to send personal data. Free-form input must meet this boundary before it reaches the endpoint.
