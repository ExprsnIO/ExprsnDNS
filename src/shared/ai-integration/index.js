/**
 * AI Integration Module
 *
 * Centralized exports for all AI integration components
 */

const DeepseekClient = require('./deepseek-client');
const ChatGPTClient = require('./chatgpt-client');
const AIOrchestrator = require('./ai-orchestrator');
const AgentOrchestrator = require('./agent-orchestrator');

module.exports = {
  DeepseekClient,
  ChatGPTClient,
  AIOrchestrator,
  AgentOrchestrator,

  // Factory function for easy setup
  createAIOrchestrator(config = {}) {
    return new AIOrchestrator({
      deepseekApiKey: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
      openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
      enableDeepseek: config.enableDeepseek,
      enableChatGPT: config.enableChatGPT,
      consensusMode: config.consensusMode,
      parallelRequests: config.parallelRequests
    });
  },

  // Factory function for agent orchestration
  createAgentOrchestrator(config = {}) {
    return new AgentOrchestrator(config);
  }
};
