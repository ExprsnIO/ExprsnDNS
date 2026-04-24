/**
 * Agent Orchestrator - Manages concurrent agent execution and coordination
 *
 * Enables parallel execution of multiple specialized agents with dependency
 * management, progress tracking, and result aggregation.
 */

const EventEmitter = require('events');
const logger = require('../logger');

class AgentOrchestrator extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      maxConcurrentAgents: config.maxConcurrentAgents || 5,
      queueStrategy: config.queueStrategy || 'priority', // 'fifo', 'priority', 'critical-first'
      timeout: config.timeout || 600000, // 10 minutes default
      retryFailed: config.retryFailed !== false,
      maxRetries: config.maxRetries || 1
    };

    this.agents = new Map(); // agentId -> agent state
    this.queue = [];
    this.running = new Set();
    this.completed = new Map();
    this.failed = new Map();

    logger.info('Agent Orchestrator initialized', this.config);
  }

  /**
   * Execute multiple agents with dependency management
   */
  async executeWorkflow(workflow) {
    logger.info('Executing workflow', {
      name: workflow.name,
      phaseCount: workflow.phases?.length || 0
    });

    const results = {
      workflowName: workflow.name,
      phases: [],
      totalDuration: 0,
      agentsExecuted: 0,
      agentsFailed: 0,
      parallelizationFactor: 0,
      startTime: Date.now()
    };

    try {
      // Execute phases sequentially
      for (const phase of workflow.phases || []) {
        const phaseResult = await this._executePhase(phase);
        results.phases.push(phaseResult);
        results.agentsExecuted += phaseResult.agentsExecuted;
        results.agentsFailed += phaseResult.agentsFailed;
      }

      results.totalDuration = Date.now() - results.startTime;
      results.parallelizationFactor = this._calculateParallelization(results);

      logger.info('Workflow completed', {
        name: workflow.name,
        duration: results.totalDuration,
        success: results.agentsFailed === 0
      });

      return results;
    } catch (error) {
      logger.error('Workflow failed', { error: error.message, workflow: workflow.name });
      throw error;
    }
  }

  /**
   * Execute a single phase with parallel workstreams
   */
  async _executePhase(phase) {
    logger.info('Executing phase', { name: phase.name });

    const phaseResult = {
      phaseName: phase.name,
      workstreams: [],
      agentsExecuted: 0,
      agentsFailed: 0,
      duration: 0,
      startTime: Date.now()
    };

    // Group agents by parallelizable workstreams
    const parallelWorkstreams = phase.workstreams || [];

    // Execute all workstreams in parallel
    const workstreamPromises = parallelWorkstreams.map(ws =>
      this._executeWorkstream(ws)
    );

    const workstreamResults = await Promise.allSettled(workstreamPromises);

    // Process results
    workstreamResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        phaseResult.workstreams.push(result.value);
        phaseResult.agentsExecuted += result.value.agentsExecuted;
        phaseResult.agentsFailed += result.value.agentsFailed;
      } else {
        phaseResult.workstreams.push({
          workstreamName: parallelWorkstreams[index].name,
          error: result.reason.message,
          agentsExecuted: 0,
          agentsFailed: 1
        });
        phaseResult.agentsFailed++;
      }
    });

    phaseResult.duration = Date.now() - phaseResult.startTime;

    // Execute sequential gates if all workstreams succeeded
    if (phase.sequentialGates && phaseResult.agentsFailed === 0) {
      for (const gate of phase.sequentialGates) {
        await this._executeGate(gate);
      }
    }

    return phaseResult;
  }

  /**
   * Execute a workstream (group of related agents)
   */
  async _executeWorkstream(workstream) {
    logger.info('Executing workstream', { name: workstream.name });

    const result = {
      workstreamName: workstream.name,
      agents: [],
      agentsExecuted: 0,
      agentsFailed: 0,
      duration: 0,
      startTime: Date.now()
    };

    const agents = workstream.agents || [];

    // Separate agents by dependencies
    const { readyAgents, waitingAgents } = this._partitionAgentsByDependencies(agents);

    // Execute ready agents in parallel
    await this._executeAgentsParallel(readyAgents, result);

    // Execute waiting agents as dependencies complete
    await this._executeAgentsWithDependencies(waitingAgents, result);

    result.duration = Date.now() - result.startTime;

    return result;
  }

  /**
   * Execute agents in parallel
   */
  async _executeAgentsParallel(agents, result) {
    const agentPromises = agents.map(agent =>
      this._executeAgent(agent)
    );

    const agentResults = await Promise.allSettled(agentPromises);

    agentResults.forEach((agentResult, index) => {
      if (agentResult.status === 'fulfilled') {
        result.agents.push(agentResult.value);
        result.agentsExecuted++;

        if (!agentResult.value.success) {
          result.agentsFailed++;
        }
      } else {
        result.agents.push({
          agentType: agents[index].type,
          task: agents[index].task,
          success: false,
          error: agentResult.reason.message
        });
        result.agentsFailed++;
      }
    });
  }

  /**
   * Execute agents with dependencies in correct order
   */
  async _executeAgentsWithDependencies(agents, result) {
    const completed = new Set();
    const outputs = new Map();

    while (agents.length > 0) {
      // Find agents whose dependencies are met
      const readyAgents = agents.filter(agent =>
        (agent.dependencies || []).every(dep => completed.has(dep))
      );

      if (readyAgents.length === 0 && agents.length > 0) {
        throw new Error('Circular dependency detected or missing dependencies');
      }

      // Execute ready agents in parallel
      const readyPromises = readyAgents.map(agent =>
        this._executeAgent(agent, outputs)
      );

      const readyResults = await Promise.allSettled(readyPromises);

      // Process results
      readyResults.forEach((agentResult, index) => {
        const agent = readyAgents[index];

        if (agentResult.status === 'fulfilled') {
          result.agents.push(agentResult.value);
          result.agentsExecuted++;

          completed.add(agent.id || agent.type);
          outputs.set(agent.id || agent.type, agentResult.value.outputs);

          if (!agentResult.value.success) {
            result.agentsFailed++;
          }
        } else {
          result.agents.push({
            agentType: agent.type,
            task: agent.task,
            success: false,
            error: agentResult.reason.message
          });
          result.agentsFailed++;
        }

        // Remove from waiting list
        const index = agents.indexOf(agent);
        if (index > -1) {
          agents.splice(index, 1);
        }
      });
    }
  }

  /**
   * Execute a single agent
   */
  async _executeAgent(agent, dependencyOutputs = new Map()) {
    const agentId = agent.id || `${agent.type}-${Date.now()}`;

    logger.info('Executing agent', {
      id: agentId,
      type: agent.type,
      task: agent.task
    });

    const agentResult = {
      agentId,
      agentType: agent.type,
      task: agent.task,
      startTime: Date.now(),
      duration: 0,
      success: false,
      outputs: null,
      error: null
    };

    this.running.add(agentId);
    this.emit('agent:started', { agentId, type: agent.type, task: agent.task });

    try {
      // Prepare agent context with dependency outputs
      const context = this._prepareAgentContext(agent, dependencyOutputs);

      // Execute agent (this would call actual agent implementation)
      const outputs = await this._runAgent(agent, context);

      agentResult.outputs = outputs;
      agentResult.success = true;
      agentResult.duration = Date.now() - agentResult.startTime;

      this.completed.set(agentId, agentResult);
      this.emit('agent:completed', agentResult);

      logger.info('Agent completed', {
        id: agentId,
        duration: agentResult.duration
      });
    } catch (error) {
      agentResult.error = error.message;
      agentResult.duration = Date.now() - agentResult.startTime;

      this.failed.set(agentId, agentResult);
      this.emit('agent:failed', agentResult);

      logger.error('Agent failed', {
        id: agentId,
        error: error.message,
        duration: agentResult.duration
      });

      // Retry if configured
      if (this.config.retryFailed && !agent._retryCount) {
        agent._retryCount = 1;
        logger.info('Retrying agent', { id: agentId });
        return await this._executeAgent(agent, dependencyOutputs);
      }
    } finally {
      this.running.delete(agentId);
    }

    return agentResult;
  }

  /**
   * Execute a sequential gate (synchronization point)
   */
  async _executeGate(gate) {
    logger.info('Executing gate', { name: gate.name });

    this.emit('gate:started', { name: gate.name });

    // Simulate gate execution (code review, integration test, etc.)
    await new Promise(resolve => setTimeout(resolve, gate.estimatedDuration || 1000));

    this.emit('gate:completed', { name: gate.name });

    logger.info('Gate completed', { name: gate.name });
  }

  /**
   * Partition agents by whether they have dependencies
   */
  _partitionAgentsByDependencies(agents) {
    const readyAgents = [];
    const waitingAgents = [];

    agents.forEach(agent => {
      if (!agent.dependencies || agent.dependencies.length === 0) {
        readyAgents.push(agent);
      } else {
        waitingAgents.push(agent);
      }
    });

    return { readyAgents, waitingAgents };
  }

  /**
   * Prepare context for agent execution
   */
  _prepareAgentContext(agent, dependencyOutputs) {
    const context = {
      agentType: agent.type,
      task: agent.task,
      parameters: agent.parameters || {},
      dependencyOutputs: {}
    };

    // Add outputs from dependencies
    (agent.dependencies || []).forEach(depId => {
      if (dependencyOutputs.has(depId)) {
        context.dependencyOutputs[depId] = dependencyOutputs.get(depId);
      }
    });

    return context;
  }

  /**
   * Run actual agent implementation
   * In production, this would call the specialized agent via Task tool
   */
  async _runAgent(agent, context) {
    // Simulate agent execution
    // In real implementation, this would use Claude Code's Task tool

    logger.debug('Running agent', { type: agent.type, context });

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate success/failure
        if (Math.random() > 0.1) { // 90% success rate for simulation
          resolve({
            result: `Completed ${agent.task}`,
            artifacts: [],
            duration: agent.duration || 1000
          });
        } else {
          reject(new Error('Simulated agent failure'));
        }
      }, agent.duration || 1000);
    });
  }

  /**
   * Calculate parallelization efficiency
   */
  _calculateParallelization(results) {
    if (results.phases.length === 0) return 1;

    // Calculate what sequential duration would have been
    const sequentialDuration = results.phases.reduce((total, phase) => {
      const phaseSequential = phase.workstreams.reduce((sum, ws) => {
        return sum + ws.duration;
      }, 0);
      return total + phaseSequential;
    }, 0);

    if (sequentialDuration === 0) return 1;

    // Parallelization factor = sequential time / actual time
    return sequentialDuration / results.totalDuration;
  }

  /**
   * Get workflow progress
   */
  getProgress() {
    return {
      running: Array.from(this.running),
      completed: this.completed.size,
      failed: this.failed.size,
      total: this.running.size + this.completed.size + this.failed.size
    };
  }

  /**
   * Get detailed results
   */
  getResults() {
    return {
      completed: Array.from(this.completed.values()),
      failed: Array.from(this.failed.values()),
      running: Array.from(this.running)
    };
  }

  /**
   * Cancel all running agents
   */
  cancelAll() {
    logger.warn('Cancelling all agents');

    this.running.forEach(agentId => {
      this.emit('agent:cancelled', { agentId });
    });

    this.running.clear();
    this.queue = [];
  }
}

module.exports = AgentOrchestrator;
