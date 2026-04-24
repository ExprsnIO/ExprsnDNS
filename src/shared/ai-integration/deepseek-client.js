/**
 * Deepseek API Client for AI-assisted development
 *
 * Provides code analysis, architecture design, and technical recommendations
 * using Deepseek's specialized models.
 */

const fetch = require('node-fetch');
const logger = require('../logger');

class DeepseekClient {
  constructor(apiKey = process.env.DEEPSEEK_API_KEY) {
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY environment variable is required');
    }

    this.apiKey = apiKey;
    this.baseURL = 'https://api.deepseek.com/v1';
    this.defaultModel = 'deepseek-chat';
    this.coderModel = 'deepseek-coder';
  }

  /**
   * Generic completion request
   */
  async complete(prompt, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages: [
            {
              role: 'system',
              content: options.systemPrompt || 'You are an expert software architect specializing in microservices and distributed systems.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens || 2000,
          stream: options.stream || false
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Deepseek API error: ${error.message || response.statusText}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content;

      logger.info('Deepseek completion successful', {
        model: options.model || this.defaultModel,
        promptLength: prompt.length,
        responseLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('Deepseek API error', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze code for security, performance, and best practices
   */
  async analyzeCode(code, context = '') {
    const prompt = `
Analyze this code for the Exprsn platform microservices architecture:

Context: ${context}

Code:
\`\`\`javascript
${code}
\`\`\`

Provide analysis focusing on:

1. **Security Vulnerabilities**
   - SQL injection risks
   - XSS vulnerabilities
   - CA token handling (must use RSA-SHA256-PSS)
   - Input validation gaps
   - Authentication/authorization issues

2. **Performance Issues**
   - Database query optimization
   - N+1 query problems
   - Memory leaks
   - Blocking operations on main thread
   - Cache opportunities

3. **Microservices Best Practices**
   - Service boundaries
   - API design (REST conventions)
   - Error handling
   - Logging and observability
   - Circuit breaker patterns

4. **Code Quality**
   - Maintainability concerns
   - Test coverage gaps
   - Code duplication
   - Naming conventions
   - Documentation needs

For each issue found, provide:
- Severity (Critical/High/Medium/Low)
- Specific line or pattern
- Recommended fix with code example
- Explanation of why it matters

Format as JSON:
{
  "summary": "Overall assessment",
  "securityIssues": [...],
  "performanceIssues": [...],
  "bestPracticeIssues": [...],
  "codeQualityIssues": [...],
  "recommendations": [...]
}
`;

    return await this.complete(prompt, {
      model: this.coderModel,
      temperature: 0.3, // Lower temperature for more consistent analysis
      maxTokens: 4000
    });
  }

  /**
   * Design microservices architecture
   */
  async designArchitecture(requirements) {
    const prompt = `
Design a microservices architecture for the Exprsn platform.

Requirements:
${JSON.stringify(requirements, null, 2)}

Existing Exprsn Services Context:
- exprsn-ca (Port 3000): Certificate Authority, CA token generation/validation
- exprsn-auth (Port 3001): OAuth2/OIDC authentication, MFA
- exprsn-timeline (Port 3004): Social feed, posts, likes, comments
- exprsn-svr (Port 5001): Low-Code Platform + Forge CRM
- exprsn-workflow (Port 3017): Visual workflow automation
- exprsn-payments (Port 3018): Multi-gateway payments
- exprsn-atlas (Port 3019): Geospatial services
- exprsn-herald (Port 3014): Notifications
- exprsn-gallery (Port 3005): Media storage
- exprsn-bridge (Port 3002): WebSocket real-time connections
- 11 additional services

Architecture Principles:
1. Database-per-service pattern
2. CA token authentication between services
3. Redis caching where appropriate
4. Bull queues for async operations
5. PostgreSQL for primary data storage
6. Service discovery via exprsn-setup

Please provide:

1. **Service Design**
   - Service name and responsibility
   - Port assignment (next available: 3020+)
   - Database schema (PostgreSQL)
   - Should this be a new service or enhance existing?

2. **API Contracts**
   - REST endpoints with HTTP methods
   - Request/response payloads (JSON schemas)
   - CA token permissions required
   - Error responses

3. **Data Models**
   - Sequelize models
   - Relationships and foreign keys
   - Indexes for performance

4. **Inter-Service Communication**
   - Which services does this integrate with?
   - CA token permissions for each integration
   - Synchronous vs asynchronous patterns
   - Bull queue jobs if needed

5. **Scalability Considerations**
   - Caching strategy (Redis)
   - Database optimization (indexes, partitioning)
   - Rate limiting requirements
   - Load balancing needs

6. **Deployment**
   - Docker container requirements
   - Environment variables
   - Health check endpoints
   - Migration strategy

Format as detailed technical specification with code examples.
`;

    return await this.complete(prompt, {
      model: this.defaultModel,
      temperature: 0.5,
      maxTokens: 6000
    });
  }

  /**
   * Optimize algorithm or implementation
   */
  async optimizeImplementation(code, performanceGoal) {
    const prompt = `
Optimize this implementation to achieve: ${performanceGoal}

Current Code:
\`\`\`javascript
${code}
\`\`\`

Provide:
1. Performance analysis of current implementation
2. Bottleneck identification
3. Optimized implementation with explanation
4. Time/space complexity comparison (Big-O)
5. Trade-offs of the optimization
6. Benchmarking approach to verify improvement

Consider:
- Database query optimization (avoid N+1)
- Caching opportunities (Redis)
- Algorithm complexity reduction
- Parallel processing (Bull queues)
- Memory efficiency
- Network calls minimization
`;

    return await this.complete(prompt, {
      model: this.coderModel,
      temperature: 0.4,
      maxTokens: 4000
    });
  }

  /**
   * Generate database migration
   */
  async generateMigration(description, existingSchema = null) {
    const prompt = `
Generate a Sequelize migration for: ${description}

${existingSchema ? `Existing Schema:\n${JSON.stringify(existingSchema, null, 2)}` : ''}

Requirements:
1. Follow Exprsn naming conventions (snake_case for tables/columns)
2. Include indexes for foreign keys and frequently queried columns
3. Use UUIDs for primary keys (Sequelize.UUIDV4)
4. Include created_at and updated_at timestamps
5. Add proper foreign key constraints with CASCADE
6. Include both up() and down() methods
7. Handle data migration if needed

Provide:
1. Migration file content
2. Updated Sequelize model
3. Any data migration logic needed
4. Rollback considerations
`;

    return await this.complete(prompt, {
      model: this.coderModel,
      temperature: 0.3,
      maxTokens: 3000
    });
  }

  /**
   * Review Pull Request
   */
  async reviewPullRequest(diff, description) {
    const prompt = `
Review this pull request for the Exprsn platform:

Description: ${description}

Diff:
\`\`\`diff
${diff}
\`\`\`

Provide code review focusing on:

1. **Correctness**
   - Logic errors
   - Edge cases not handled
   - Type safety issues

2. **Security**
   - Authentication/authorization
   - Input validation
   - CA token handling
   - SQL injection risks
   - XSS vulnerabilities

3. **Performance**
   - Database queries
   - Caching opportunities
   - Algorithm efficiency
   - Memory usage

4. **Testing**
   - Test coverage
   - Missing test cases
   - Edge cases not tested

5. **Maintainability**
   - Code clarity
   - Documentation
   - Naming conventions
   - Code duplication

For each issue:
- File and line number
- Severity (blocking/major/minor/nit)
- Explanation
- Suggested fix

Also provide:
- Overall assessment (approve/request changes/comment)
- Summary of changes
- Positive feedback on good implementations
`;

    return await this.complete(prompt, {
      model: this.coderModel,
      temperature: 0.4,
      maxTokens: 5000
    });
  }

  /**
   * Generate test cases
   */
  async generateTests(code, testType = 'unit') {
    const prompt = `
Generate comprehensive ${testType} tests for:

\`\`\`javascript
${code}
\`\`\`

Test Framework: Jest (Exprsn uses Jest for all services)

Provide tests covering:
1. Happy path scenarios
2. Edge cases
3. Error conditions
4. Boundary values
5. CA token validation (if applicable)
6. Database interactions (mock with jest.mock)
7. Async operations (use async/await)

Test structure:
- describe() blocks for logical grouping
- beforeEach() for setup
- afterEach() for cleanup
- Meaningful test descriptions
- Arrange-Act-Assert pattern
- Mock external dependencies

Target: 70%+ code coverage

Include:
- Test file content
- Mock setup if needed
- Coverage report interpretation
`;

    return await this.complete(prompt, {
      model: this.coderModel,
      temperature: 0.4,
      maxTokens: 4000
    });
  }

  /**
   * Suggest refactoring
   */
  async suggestRefactoring(code, goals = []) {
    const prompt = `
Suggest refactoring for this code:

\`\`\`javascript
${code}
\`\`\`

Goals: ${goals.join(', ') || 'Improve maintainability and readability'}

Consider:
1. Extract methods/functions
2. Remove code duplication (DRY)
3. Simplify complex conditionals
4. Improve naming
5. Separate concerns
6. Apply design patterns where appropriate
7. Improve error handling

For each suggestion:
1. What to refactor and why
2. Refactored code
3. Benefits of the change
4. Any trade-offs
5. Testing considerations

Maintain:
- Same functionality
- Backward compatibility
- Exprsn coding standards
`;

    return await this.complete(prompt, {
      model: this.coderModel,
      temperature: 0.5,
      maxTokens: 4000
    });
  }
}

module.exports = DeepseekClient;
