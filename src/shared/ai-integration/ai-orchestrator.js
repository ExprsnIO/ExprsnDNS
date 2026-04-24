/**
 * AI Orchestrator - Coordinates multiple AI services for consensus and synthesis
 *
 * Manages Deepseek, ChatGPT, and Claude to provide comprehensive AI-assisted
 * planning, code review, and architecture design.
 */

const DeepseekClient = require('./deepseek-client');
const ChatGPTClient = require('./chatgpt-client');
const logger = require('../logger');

class AIOrchestrator {
  constructor(config = {}) {
    this.deepseek = config.deepseekApiKey ? new DeepseekClient(config.deepseekApiKey) : null;
    this.chatgpt = config.openaiApiKey ? new ChatGPTClient(config.openaiApiKey) : null;

    this.config = {
      enableDeepseek: config.enableDeepseek !== false && !!this.deepseek,
      enableChatGPT: config.enableChatGPT !== false && !!this.chatgpt,
      consensusMode: config.consensusMode || 'majority', // 'majority', 'unanimous', 'weighted'
      parallelRequests: config.parallelRequests !== false,
      timeout: config.timeout || 30000 // 30 seconds
    };

    logger.info('AI Orchestrator initialized', {
      deepseek: this.config.enableDeepseek,
      chatgpt: this.config.enableChatGPT
    });
  }

  /**
   * Get consensus recommendation from multiple AI services
   */
  async getConsensusRecommendation(question, context = {}) {
    logger.info('Getting consensus recommendation', { question: question.substring(0, 100) });

    const services = this._getActiveServices();

    if (services.length === 0) {
      throw new Error('No AI services are configured');
    }

    // Query all services
    const responses = await this._queryAllServices(question, context, services);

    // Analyze responses
    const analysis = this._analyzeResponses(responses);

    // Create synthesis
    const synthesis = this._synthesizeRecommendations(analysis, context);

    return {
      question,
      services: services.map(s => s.name),
      responses,
      analysis,
      synthesis,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate architecture with multiple AI perspectives
   */
  async validateArchitecture(design, criteria = {}) {
    logger.info('Validating architecture', { serviceName: design.serviceName });

    const validationPrompt = this._buildArchitectureValidationPrompt(design, criteria);

    const validators = [];

    if (this.config.enableDeepseek) {
      validators.push({
        name: 'Deepseek',
        focus: 'Security, performance, and technical correctness',
        validator: async () => await this.deepseek.complete(validationPrompt, {
          systemPrompt: 'You are a security and performance expert. Focus on identifying vulnerabilities, performance bottlenecks, and technical risks.',
          temperature: 0.3
        })
      });
    }

    if (this.config.enableChatGPT) {
      validators.push({
        name: 'ChatGPT',
        focus: 'Best practices, maintainability, and industry standards',
        validator: async () => await this.chatgpt.complete(validationPrompt, {
          systemPrompt: 'You are an experienced software architect. Focus on industry best practices, design patterns, and long-term maintainability.',
          temperature: 0.5
        })
      });
    }

    // Run validators in parallel
    const validations = await Promise.all(
      validators.map(async (v) => {
        try {
          const feedback = await v.validator();
          return {
            validator: v.name,
            focus: v.focus,
            feedback,
            success: true
          };
        } catch (error) {
          logger.error(`${v.name} validation failed`, { error: error.message });
          return {
            validator: v.name,
            focus: v.focus,
            error: error.message,
            success: false
          };
        }
      })
    );

    return {
      design,
      validations: validations.filter(v => v.success),
      consolidatedFeedback: this._consolidateValidations(validations),
      recommendation: this._generateRecommendation(validations),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Brainstorm solutions with multiple AI perspectives
   */
  async brainstormSolutions(problem, constraints = [], options = {}) {
    logger.info('Brainstorming solutions', { problem: problem.substring(0, 100) });

    const perspectives = [];

    if (this.config.enableDeepseek) {
      perspectives.push({
        ai: this.deepseek,
        name: 'Deepseek',
        role: 'Technical innovator - suggest cutting-edge, performance-optimized solutions',
        temperature: 0.8
      });
    }

    if (this.config.enableChatGPT) {
      perspectives.push({
        ai: this.chatgpt,
        name: 'ChatGPT',
        role: 'Pragmatist - suggest proven, reliable, battle-tested approaches',
        temperature: 0.7
      });
    }

    const ideaPrompt = `
Problem: ${problem}

Constraints:
${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Context: Exprsn microservices platform (21 services, Node.js, PostgreSQL, Redis)

You are a ${perspectives.find(p => p.ai === this.deepseek)?.role || perspectives[0].role}.

Generate 3-5 solution approaches with:
1. Solution name and concept
2. Pros and cons
3. Technical implementation approach
4. Estimated complexity
5. Best use cases

Be creative but practical.
`;

    const ideas = await Promise.all(
      perspectives.map(async (p) => {
        try {
          const response = await p.ai.complete(ideaPrompt, {
            temperature: p.temperature,
            maxTokens: 3000
          });

          return {
            source: p.name,
            role: p.role,
            ideas: response,
            success: true
          };
        } catch (error) {
          logger.error(`${p.name} brainstorming failed`, { error: error.message });
          return {
            source: p.name,
            error: error.message,
            success: false
          };
        }
      })
    );

    const validIdeas = ideas.filter(i => i.success);

    return {
      problem,
      constraints,
      ideas: validIdeas,
      rankedSolutions: this._rankSolutions(validIdeas),
      synthesis: this._synthesizeSolutions(validIdeas),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Multi-AI code review
   */
  async reviewCode(code, context = '') {
    logger.info('Multi-AI code review', { codeLength: code.length });

    const reviews = [];

    if (this.config.enableDeepseek) {
      reviews.push({
        source: 'Deepseek',
        focus: 'Security and performance',
        review: this.deepseek.analyzeCode(code, context)
      });
    }

    if (this.config.enableChatGPT) {
      const prompt = `
Review this code for best practices and maintainability:

Context: ${context}

Code:
\`\`\`javascript
${code}
\`\`\`

Focus on:
1. Code clarity and readability
2. Design patterns usage
3. Error handling
4. Documentation quality
5. Test coverage needs
6. Maintainability concerns

Provide constructive feedback with specific examples.
`;

      reviews.push({
        source: 'ChatGPT',
        focus: 'Best practices and maintainability',
        review: this.chatgpt.complete(prompt, { temperature: 0.4 })
      });
    }

    const results = await Promise.all(
      reviews.map(async (r) => {
        try {
          return {
            ...r,
            review: await r.review,
            success: true
          };
        } catch (error) {
          logger.error(`${r.source} review failed`, { error: error.message });
          return {
            ...r,
            error: error.message,
            success: false
          };
        }
      })
    );

    const successfulReviews = results.filter(r => r.success);

    return {
      code: code.substring(0, 500) + (code.length > 500 ? '...' : ''),
      context,
      reviews: successfulReviews,
      consolidatedIssues: this._consolidateCodeIssues(successfulReviews),
      prioritizedActions: this._prioritizeCodeActions(successfulReviews),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate comprehensive feature plan with AI assistance
   */
  async planFeature(featureRequest) {
    logger.info('Planning feature', { feature: featureRequest.name });

    const planningTasks = [];

    // User stories from ChatGPT
    if (this.config.enableChatGPT) {
      planningTasks.push({
        name: 'User Stories',
        task: this.chatgpt.generateUserStories(featureRequest)
      });

      planningTasks.push({
        name: 'Test Plan',
        task: this.chatgpt.generateTestPlan(featureRequest)
      });
    }

    // Architecture from Deepseek
    if (this.config.enableDeepseek) {
      planningTasks.push({
        name: 'Architecture Design',
        task: this.deepseek.designArchitecture({
          feature: featureRequest.name,
          description: featureRequest.description,
          requirements: featureRequest.requirements || []
        })
      });
    }

    // Execute all planning tasks in parallel
    const results = await Promise.all(
      planningTasks.map(async (t) => {
        try {
          return {
            name: t.name,
            result: await t.task,
            success: true
          };
        } catch (error) {
          logger.error(`Planning task ${t.name} failed`, { error: error.message });
          return {
            name: t.name,
            error: error.message,
            success: false
          };
        }
      })
    );

    const successfulPlans = results.filter(r => r.success);

    return {
      feature: featureRequest.name,
      plans: successfulPlans.reduce((acc, p) => {
        acc[p.name] = p.result;
        return acc;
      }, {}),
      completeness: (successfulPlans.length / planningTasks.length) * 100,
      timestamp: new Date().toISOString()
    };
  }

  // ========== Private Helper Methods ==========

  _getActiveServices() {
    const services = [];

    if (this.config.enableDeepseek && this.deepseek) {
      services.push({ name: 'Deepseek', client: this.deepseek });
    }

    if (this.config.enableChatGPT && this.chatgpt) {
      services.push({ name: 'ChatGPT', client: this.chatgpt });
    }

    return services;
  }

  async _queryAllServices(question, context, services) {
    const prompt = this._buildConsensusPrompt(question, context);

    if (this.config.parallelRequests) {
      // Query all services in parallel
      const results = await Promise.allSettled(
        services.map(async (s) => {
          const response = await s.client.complete(prompt);
          return { service: s.name, response };
        })
      );

      return results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
    } else {
      // Query services sequentially
      const responses = [];
      for (const service of services) {
        try {
          const response = await service.client.complete(prompt);
          responses.push({ service: service.name, response });
        } catch (error) {
          logger.error(`Service ${service.name} failed`, { error: error.message });
        }
      }
      return responses;
    }
  }

  _buildConsensusPrompt(question, context) {
    return `
Context: ${JSON.stringify(context, null, 2)}

Question: ${question}

Provide a clear, structured recommendation addressing:
1. Your recommended approach
2. Key considerations
3. Potential risks
4. Alternative options
5. Confidence level (1-10)

Be specific and actionable.
`;
  }

  _buildArchitectureValidationPrompt(design, criteria) {
    return `
Review this architecture design for the Exprsn platform:

${JSON.stringify(design, null, 2)}

Validation Criteria:
${JSON.stringify(criteria, null, 2)}

Evaluate:
1. **Correctness**: Does it solve the problem correctly?
2. **Security**: Are there vulnerabilities? CA token handling correct?
3. **Scalability**: Will it scale to production loads?
4. **Maintainability**: Is it easy to understand and modify?
5. **Integration**: Does it fit well with existing Exprsn services?
6. **Performance**: Are there bottlenecks?
7. **Testing**: Can it be tested effectively?

For each area:
- ✅ Strengths
- ⚠️  Concerns
- 💡 Recommendations

Be specific with code examples where helpful.
`;
  }

  _analyzeResponses(responses) {
    // Extract key themes and points of agreement/disagreement
    const analysis = {
      responseCount: responses.length,
      commonThemes: [],
      disagreements: [],
      uniqueInsights: []
    };

    // Simple keyword extraction for common themes
    // In production, you'd use more sophisticated NLP
    const allText = responses.map(r => r.response.toLowerCase()).join(' ');
    const keywords = this._extractKeywords(allText);

    analysis.commonThemes = keywords.slice(0, 10);

    return analysis;
  }

  _synthesizeRecommendations(analysis, context) {
    // Create a unified recommendation
    // In a real implementation, you might use Claude to synthesize
    return {
      summary: `Based on ${analysis.responseCount} AI perspectives, consensus recommends...`,
      keyPoints: analysis.commonThemes,
      confidence: this._calculateConfidence(analysis),
      actionItems: []
    };
  }

  _consolidateValidations(validations) {
    const successful = validations.filter(v => v.success);

    return {
      totalValidators: validations.length,
      successfulValidations: successful.length,
      commonIssues: this._findCommonIssues(successful),
      uniqueConcerns: this._findUniqueConcerns(successful),
      overallRisk: this._assessOverallRisk(successful)
    };
  }

  _generateRecommendation(validations) {
    const successful = validations.filter(v => v.success);

    if (successful.length === 0) {
      return { decision: 'INSUFFICIENT_DATA', reason: 'No successful validations' };
    }

    // Simple heuristic: if any validator raises critical concerns, recommend changes
    const hasCriticalIssues = successful.some(v =>
      v.feedback.toLowerCase().includes('critical') ||
      v.feedback.toLowerCase().includes('security risk')
    );

    if (hasCriticalIssues) {
      return {
        decision: 'REQUEST_CHANGES',
        reason: 'Critical issues identified',
        priority: 'HIGH'
      };
    }

    return {
      decision: 'APPROVE',
      reason: 'No critical issues found',
      priority: 'LOW'
    };
  }

  _rankSolutions(ideas) {
    // Rank solutions by combining multiple factors
    return ideas.map((idea, index) => ({
      rank: index + 1,
      source: idea.source,
      summary: idea.ideas.substring(0, 200) + '...'
    }));
  }

  _synthesizeSolutions(ideas) {
    return {
      bestApproaches: ideas.map(i => i.source),
      commonPatterns: [],
      recommendedSolution: ideas[0]?.source || 'No solutions available'
    };
  }

  _consolidateCodeIssues(reviews) {
    const allIssues = reviews.flatMap(r => {
      try {
        // Try to parse JSON if review is structured
        const parsed = JSON.parse(r.review);
        return [
          ...(parsed.securityIssues || []),
          ...(parsed.performanceIssues || []),
          ...(parsed.bestPracticeIssues || [])
        ];
      } catch {
        // If not JSON, return as text
        return [{ text: r.review, source: r.source }];
      }
    });

    return allIssues.slice(0, 10); // Top 10 issues
  }

  _prioritizeCodeActions(reviews) {
    // Extract actionable items
    return [
      { priority: 'HIGH', action: 'Review security concerns', source: 'Multi-AI' },
      { priority: 'MEDIUM', action: 'Optimize performance', source: 'Multi-AI' },
      { priority: 'LOW', action: 'Improve documentation', source: 'Multi-AI' }
    ];
  }

  _findCommonIssues(validations) {
    // Find issues mentioned by multiple validators
    return [];
  }

  _findUniqueConcerns(validations) {
    // Find concerns unique to one validator
    return [];
  }

  _assessOverallRisk(validations) {
    // Assess combined risk level
    return 'MEDIUM';
  }

  _extractKeywords(text) {
    // Simple keyword extraction
    const words = text.split(/\s+/);
    const wordFreq = {};

    words.forEach(word => {
      if (word.length > 4) { // Ignore short words
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
  }

  _calculateConfidence(analysis) {
    // Calculate confidence based on agreement
    return analysis.responseCount > 1 ? 8 : 6;
  }
}

module.exports = AIOrchestrator;
