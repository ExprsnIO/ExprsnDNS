/**
 * ChatGPT API Client for AI-assisted development
 *
 * Provides user story generation, documentation, test planning,
 * and general purpose AI assistance.
 */

const fetch = require('node-fetch');
const logger = require('../logger');

class ChatGPTClient {
  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.apiKey = apiKey;
    this.baseURL = 'https://api.openai.com/v1';
    this.defaultModel = 'gpt-4-turbo-preview';
    this.fastModel = 'gpt-3.5-turbo';
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
              content: options.systemPrompt || 'You are a product manager and technical architect helping plan features for the Exprsn platform.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens || 2000
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content;

      logger.info('ChatGPT completion successful', {
        model: options.model || this.defaultModel,
        promptLength: prompt.length,
        responseLength: result.length
      });

      return result;
    } catch (error) {
      logger.error('ChatGPT API error', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate user stories for a feature
   */
  async generateUserStories(feature) {
    const prompt = `
Generate comprehensive user stories for the following feature in the Exprsn platform:

Feature Name: ${feature.name}
Description: ${feature.description}
Target Users: ${feature.targetUsers || 'General users of the Exprsn platform'}
Context: ${feature.context || 'Exprsn is a microservices-based social platform with 21+ services'}

Please generate 8-12 user stories covering:

1. **Core Functionality** (Must-Have)
   - Primary user workflows
   - Happy path scenarios
   - Essential features for MVP

2. **Edge Cases** (Should-Have)
   - Alternative workflows
   - Error scenarios
   - Boundary conditions

3. **User Experience** (Should-Have)
   - Onboarding and discovery
   - Notifications and feedback
   - Settings and preferences

4. **Administrative** (Could-Have)
   - Management and moderation
   - Analytics and reporting
   - Configuration

Format each story as:

**Story Title**
- **As a** [user type]
- **I want** [goal/desire]
- **So that** [benefit/value]

**Acceptance Criteria:**
- [ ] Criterion 1 (testable, measurable)
- [ ] Criterion 2
- [ ] Criterion 3

**Priority:** Must-Have / Should-Have / Could-Have
**Estimated Effort:** Small (1-3 days) / Medium (1-2 weeks) / Large (2-4 weeks)
**Dependencies:** [Any prerequisites]

Also include:
- Persona descriptions for different user types
- User journey map for primary workflow
- Success metrics for the feature
`;

    return await this.complete(prompt, {
      temperature: 0.8, // Higher for creative user story generation
      maxTokens: 4000
    });
  }

  /**
   * Generate API documentation
   */
  async generateDocumentation(implementation) {
    const prompt = `
Generate comprehensive documentation for this API implementation:

${JSON.stringify(implementation, null, 2)}

Create documentation including:

1. **Overview**
   - What this API does
   - Use cases
   - Integration with other Exprsn services

2. **Authentication**
   - CA token requirements
   - Required permissions (read, write, append, delete, update)
   - Token generation example

3. **Endpoints**
   For each endpoint:
   - HTTP method and path
   - Description
   - Request parameters (path, query, body)
   - Request example (curl, JavaScript)
   - Response schema
   - Response examples (success and error)
   - Status codes
   - Rate limiting

4. **Data Models**
   - Schema definitions
   - Field descriptions
   - Validation rules
   - Example objects

5. **Error Handling**
   - Error response format
   - Common error codes
   - Troubleshooting guide

6. **Examples**
   - Common workflows
   - Integration examples
   - SDKs (if applicable)

7. **Testing**
   - How to test locally
   - Postman collection structure
   - Test data setup

Format in Markdown with proper headings, code blocks, and tables.
`;

    return await this.complete(prompt, {
      temperature: 0.5,
      maxTokens: 5000
    });
  }

  /**
   * Generate test plan
   */
  async generateTestPlan(feature) {
    const prompt = `
Create a comprehensive test plan for:

Feature: ${feature.name}
Description: ${feature.description}
Services Involved: ${feature.services?.join(', ') || 'To be determined'}

Generate a test plan covering:

1. **Test Strategy**
   - Testing objectives
   - Scope (in/out of scope)
   - Test levels (unit, integration, e2e, performance)
   - Entry/exit criteria

2. **Unit Tests** (Target: 70%+ coverage)
   - Components to test
   - Test cases for each component
   - Mocking strategy
   - Coverage goals

3. **Integration Tests**
   - Service integration points
   - API contract tests
   - Database integration tests
   - CA token validation tests

4. **End-to-End Tests**
   - User workflows to test
   - Critical paths
   - Cross-browser/platform testing (if applicable)

5. **Security Tests**
   - Authentication/authorization tests
   - Input validation tests
   - CA token security tests
   - OWASP Top 10 coverage

6. **Performance Tests**
   - Load testing scenarios
   - Stress testing scenarios
   - Expected metrics (response time, throughput)
   - Scalability tests

7. **Test Cases**
   Format as:
   | ID | Test Case | Given | When | Then | Priority | Type |
   |---|---|---|---|---|---|---|

8. **Test Data Requirements**
   - Test users
   - Sample data
   - Edge case data

9. **Defect Management**
   - Bug reporting process
   - Severity classifications
   - Acceptance criteria for fixes

10. **Test Schedule**
    - Testing phases timeline
    - Resource requirements
    - Dependencies

Format as structured document with clear sections.
`;

    return await this.complete(prompt, {
      temperature: 0.6,
      maxTokens: 5000
    });
  }

  /**
   * Brainstorm solutions
   */
  async brainstormSolutions(problem, constraints = []) {
    const prompt = `
Brainstorm creative solutions for this problem:

Problem: ${problem}

Constraints:
${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Context: Exprsn platform (21+ microservices, PostgreSQL, Redis, Node.js)

Generate 5-7 diverse solution approaches:

For each solution:

**Solution [N]: [Name]**

**Concept:**
[Clear explanation of the approach]

**Pros:**
- Advantage 1
- Advantage 2
- Advantage 3

**Cons:**
- Disadvantage 1
- Disadvantage 2
- Disadvantage 3

**Technical Implementation:**
- Services involved
- Key technologies
- Integration points
- Estimated complexity (Low/Medium/High)

**Example:**
[Brief code or architecture sketch]

**Best For:**
[When this solution is ideal]

After all solutions, provide:

**Recommendation Matrix:**
| Solution | Cost | Time | Scalability | Maintainability | Risk | Overall Score |
|---|---|---|---|---|---|---|

**Final Recommendation:**
[Which solution to choose and why, considering trade-offs]
`;

    return await this.complete(prompt, {
      temperature: 0.9, // High creativity for brainstorming
      maxTokens: 4000
    });
  }

  /**
   * Generate release notes
   */
  async generateReleaseNotes(changes, version) {
    const prompt = `
Generate professional release notes for Exprsn platform version ${version}.

Changes:
${JSON.stringify(changes, null, 2)}

Create release notes with:

1. **Version:** ${version}
2. **Release Date:** [Today's date]
3. **Highlights** (2-3 key improvements)

4. **New Features** ✨
   - Feature name: Description
   - Visual: [Suggest screenshot or demo]

5. **Improvements** 🚀
   - Enhancement: What's better
   - Impact: Who benefits

6. **Bug Fixes** 🐛
   - Issue: What was fixed
   - Impact: Who was affected

7. **Technical Changes** 🔧
   - API changes (breaking/non-breaking)
   - Database migrations
   - Configuration changes
   - Deprecations

8. **Security Updates** 🔒
   - Security fixes (without exposing vulnerabilities)
   - Updates to dependencies

9. **Performance** ⚡
   - Performance improvements
   - Metrics (if available)

10. **Breaking Changes** ⚠️
    - What's breaking
    - Migration guide
    - Timeline for deprecation

11. **Upgrade Instructions**
    - Step-by-step upgrade process
    - Rollback procedure
    - Estimated downtime

12. **Known Issues**
    - Current limitations
    - Workarounds

Format for both:
- **User-facing** (product language, benefits-focused)
- **Developer-facing** (technical details, API changes)
`;

    return await this.complete(prompt, {
      temperature: 0.6,
      maxTokens: 3000
    });
  }

  /**
   * Create communication plan
   */
  async createCommunicationPlan(announcement, audience) {
    const prompt = `
Create a communication plan for:

Announcement: ${announcement.title}
Details: ${announcement.details}
Target Audience: ${audience}

Generate:

1. **Communication Goals**
   - Primary objective
   - Secondary objectives
   - Success metrics

2. **Key Messages**
   - Main message (one sentence)
   - Supporting points (3-5)
   - Call to action

3. **Audience Segmentation**
   For each segment:
   - Who they are
   - What they care about
   - Tailored message
   - Best channel

4. **Communication Channels**
   | Channel | Audience | Message | Timing | Owner |
   |---|---|---|---|---|

5. **Timeline**
   - Pre-announcement (teasers)
   - Announcement day
   - Follow-up communications
   - Milestones to highlight

6. **Content Assets**
   - Email template
   - Social media posts
   - Blog post outline
   - FAQ
   - Demo script

7. **Risk Management**
   - Potential concerns
   - Prepared responses
   - Escalation plan

8. **Feedback Collection**
   - How to gather feedback
   - Metrics to track
   - Adjustment plan

Provide ready-to-use templates for email and social media.
`;

    return await this.complete(prompt, {
      temperature: 0.7,
      maxTokens: 4000
    });
  }

  /**
   * Generate FAQ
   */
  async generateFAQ(topic, context = '') {
    const prompt = `
Generate a comprehensive FAQ for: ${topic}

Context: ${context}

Create 15-20 questions covering:

1. **Getting Started** (3-4 questions)
   - What is it?
   - Who is it for?
   - How do I get started?

2. **Common Use Cases** (3-4 questions)
   - Typical workflows
   - Best practices
   - Examples

3. **Technical Details** (3-4 questions)
   - How does it work?
   - Requirements
   - Limitations

4. **Troubleshooting** (3-4 questions)
   - Common issues
   - Error messages
   - Solutions

5. **Advanced Topics** (2-3 questions)
   - Power user features
   - Customization
   - Integration

Format each as:

**Q: [Clear, user-focused question]**
**A:** [Concise answer with examples if helpful. Link to detailed docs if needed.]

Also include:
- Search-friendly keywords
- Related questions for each answer
- Contact info for additional support
`;

    return await this.complete(prompt, {
      temperature: 0.6,
      maxTokens: 4000
    });
  }

  /**
   * Quick completion with fast model
   */
  async quickComplete(prompt, options = {}) {
    return await this.complete(prompt, {
      ...options,
      model: this.fastModel
    });
  }
}

module.exports = ChatGPTClient;
