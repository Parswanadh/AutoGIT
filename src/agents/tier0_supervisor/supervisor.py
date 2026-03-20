"""
Pipeline Supervisor - God Mode Orchestrator
Handles health monitoring, error recovery, checkpointing, and graceful shutdown.
"""

import asyncio
import signal
import time
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, Any, Optional, Callable
import json

from src.utils.logger import get_logger
from src.utils.error_types import (
    CircuitBreakerOpen, OllamaConnectionError, AgentExecutionError
)

logger = get_logger("supervisor")


class SupervisorState(Enum):
    """Pipeline execution states"""
    INITIALIZING = "initializing"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"
    RECOVERING = "recovering"
    COMPLETED = "completed"
    SHUTDOWN = "shutdown"


class PipelineSupervisor:
    """
    Top-level orchestrator for the entire pipeline.
    
    Responsibilities:
    - Health monitoring (Ollama, resources)
    - Error recovery and retry logic
    - State checkpointing and resumption
    - Graceful shutdown handling
    - Circuit breaker for critical failures
    """
    
    def __init__(
        self,
        checkpoint_dir: str = "./data/checkpoints",
        checkpoint_interval_seconds: int = 300,  # 5 minutes
        max_consecutive_errors: int = 5,
        health_check_interval_seconds: int = 30
    ):
        self.state = SupervisorState.INITIALIZING
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        
        self.checkpoint_interval = checkpoint_interval_seconds
        self.max_errors = max_consecutive_errors
        self.health_check_interval = health_check_interval_seconds
        
        # State tracking
        self.error_count = 0
        self.consecutive_errors = 0
        self.total_errors = 0
        self.warnings_count = 0
        self.agents_executed = 0
        self.start_time = None
        self.last_checkpoint_time = None
        self.last_health_check = None
        
        # Shutdown handling
        self.shutdown_requested = False
        self.setup_signal_handlers()
        
        logger.info("🎯 Supervisor initialized")
    
    def setup_signal_handlers(self):
        """Setup graceful shutdown on Ctrl+C"""
        def signal_handler(signum, frame):
            logger.warning("⚠️  Interrupt signal received (Ctrl+C)")
            self.request_shutdown()
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    def request_shutdown(self):
        """Request graceful shutdown"""
        self.shutdown_requested = True
        logger.info("🛑 Initiating graceful shutdown...")
    
    def start(self):
        """Start supervision"""
        self.state = SupervisorState.RUNNING
        self.start_time = datetime.now()
        self.last_checkpoint_time = time.time()
        self.last_health_check = time.time()
        logger.info("🟢 Pipeline RUNNING")
    
    def pause(self, reason: str):
        """Pause pipeline execution"""
        if self.state == SupervisorState.PAUSED:
            return
        
        self.state = SupervisorState.PAUSED
        logger.warning(f"🔴 Pipeline PAUSED: {reason}")
    
    def resume(self):
        """Resume from paused state"""
        if self.state != SupervisorState.PAUSED:
            logger.warning(f"Cannot resume from state: {self.state}")
            return False
        
        self.state = SupervisorState.RUNNING
        self.consecutive_errors = 0
        logger.info("🟢 Pipeline RESUMED")
        return True
    
    def check_shutdown(self) -> bool:
        """Check if shutdown was requested"""
        return self.shutdown_requested
    
    def check_health(self) -> bool:
        """
        Check system health.
        Returns True if healthy, False otherwise.
        """
        current_time = time.time()
        
        # Only check at intervals
        if current_time - self.last_health_check < self.health_check_interval:
            return True
        
        self.last_health_check = current_time
        
        # Check Ollama connection
        try:
            import ollama as _ollama_sync
            _ollama_sync.list()
            return True
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
    
    def should_checkpoint(self) -> bool:
        """Check if we should save a checkpoint"""
        current_time = time.time()
        return (current_time - self.last_checkpoint_time) >= self.checkpoint_interval
    
    def save_checkpoint(self, state_data: Dict[str, Any]) -> Optional[str]:
        """
        Save pipeline state to checkpoint file.
        
        Args:
            state_data: Pipeline state to save
        
        Returns:
            Path to checkpoint file, or None on error
        """
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            checkpoint_path = self.checkpoint_dir / f"checkpoint_{timestamp}.json"
            
            checkpoint = {
                "timestamp": datetime.now().isoformat(),
                "supervisor_state": self.state.value,
                "error_count": self.error_count,
                "consecutive_errors": self.consecutive_errors,
                "agents_executed": self.agents_executed,
                "state_data": state_data
            }
            
            with open(checkpoint_path, 'w') as f:
                json.dump(checkpoint, f, indent=2, default=str)
            
            self.last_checkpoint_time = time.time()
            logger.info(f"💾 Checkpoint saved: {checkpoint_path.name}")
            return str(checkpoint_path)
            
        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            return None
    
    def load_checkpoint(self, checkpoint_path: str) -> Optional[Dict[str, Any]]:
        """
        Load pipeline state from checkpoint.
        
        Args:
            checkpoint_path: Path to checkpoint file
        
        Returns:
            State data, or None on error
        """
        try:
            with open(checkpoint_path, 'r') as f:
                checkpoint = json.load(f)
            
            # Restore supervisor state
            self.error_count = checkpoint.get("error_count", 0)
            self.consecutive_errors = checkpoint.get("consecutive_errors", 0)
            self.agents_executed = checkpoint.get("agents_executed", 0)
            
            logger.info(f"📂 Checkpoint loaded: {Path(checkpoint_path).name}")
            logger.info(f"   Timestamp: {checkpoint['timestamp']}")
            logger.info(f"   Agents executed: {self.agents_executed}")
            
            return checkpoint.get("state_data")
            
        except Exception as e:
            logger.error(f"Failed to load checkpoint: {e}")
            return None
    
    def list_checkpoints(self) -> list:
        """List all available checkpoints"""
        checkpoints = sorted(self.checkpoint_dir.glob("checkpoint_*.json"), reverse=True)
        return [str(cp) for cp in checkpoints]
    
    def record_success(self):
        """Record successful agent execution"""
        self.consecutive_errors = 0
        self.agents_executed += 1
    
    def record_error(self, error: Exception, agent_name: str = "unknown"):
        """Record agent execution error"""
        self.error_count += 1
        self.consecutive_errors += 1
        self.total_errors += 1
        
        logger.error(f"❌ Agent '{agent_name}' failed: {error}")
        
        # Check circuit breaker
        if self.consecutive_errors >= self.max_errors:
            self.activate_circuit_breaker()
    
    def record_warning(self, message: str):
        """Record warning"""
        self.warnings_count += 1
        logger.warning(f"⚠️  {message}")
    
    def activate_circuit_breaker(self):
        """Activate circuit breaker - halt pipeline"""
        self.state = SupervisorState.ERROR
        logger.critical(f"🛑 CIRCUIT BREAKER ACTIVATED")
        logger.critical(f"   {self.consecutive_errors} consecutive failures detected")
        logger.critical(f"   Pipeline HALTED - manual intervention required")
        
        # Save error report
        self.save_error_report()
        
        raise CircuitBreakerOpen(
            f"Pipeline halted after {self.consecutive_errors} consecutive failures"
        )
    
    def save_error_report(self):
        """Save detailed error report"""
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_path = self.checkpoint_dir / f"error_report_{timestamp}.json"
            
            report = {
                "timestamp": datetime.now().isoformat(),
                "state": self.state.value,
                "error_count": self.error_count,
                "consecutive_errors": self.consecutive_errors,
                "total_errors": self.total_errors,
                "warnings_count": self.warnings_count,
                "agents_executed": self.agents_executed,
                "uptime_seconds": (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
            }
            
            with open(report_path, 'w') as f:
                json.dump(report, f, indent=2)
            
            logger.info(f"📋 Error report saved: {report_path.name}")
            
        except Exception as e:
            logger.error(f"Failed to save error report: {e}")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current supervisor status"""
        uptime = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        
        return {
            "state": self.state.value,
            "uptime_seconds": uptime,
            "agents_executed": self.agents_executed,
            "error_count": self.error_count,
            "consecutive_errors": self.consecutive_errors,
            "warnings_count": self.warnings_count,
            "last_health_check": self.last_health_check,
            "last_checkpoint": self.last_checkpoint_time
        }
    
    def execute_with_supervision(
        self,
        agent_func: Callable,
        agent_name: str,
        *args,
        **kwargs
    ) -> Any:
        """
        Execute agent with full supervision and error handling.
        
        Args:
            agent_func: Agent function to execute
            agent_name: Name of the agent
            *args, **kwargs: Arguments to pass to agent
        
        Returns:
            Agent result
        
        Raises:
            CircuitBreakerOpen: If max errors exceeded
        """
        # Check if shutdown requested
        if self.check_shutdown():
            raise KeyboardInterrupt("Shutdown requested")
        
        # Check system health
        if not self.check_health():
            self.pause("Health check failed")
            # Attempt recovery
            time.sleep(5)
            if self.check_health():
                self.resume()
            else:
                raise OllamaConnectionError("Ollama server unavailable")
        
        # Execute agent
        try:
            logger.info(f"🔄 Executing: {agent_name}")
            result = agent_func(*args, **kwargs)
            self.record_success()
            return result
            
        except Exception as e:
            self.record_error(e, agent_name)
            
            # Retry logic
            if self.consecutive_errors < self.max_errors:
                logger.warning(f"🔁 Retrying {agent_name} (attempt {self.consecutive_errors + 1})")
                time.sleep(2 ** self.consecutive_errors)  # Exponential backoff
                return self.execute_with_supervision(agent_func, agent_name, *args, **kwargs)
            else:
                # Max retries exceeded
                raise AgentExecutionError(agent_name, str(e), e)
    
    def shutdown(self, state_data: Optional[Dict[str, Any]] = None):
        """Graceful shutdown"""
        logger.info("🔴 Shutting down supervisor...")
        
        # Save final checkpoint
        if state_data:
            self.save_checkpoint(state_data)
        
        # Save final status
        status = self.get_status()
        logger.info(f"   Agents executed: {status['agents_executed']}")
        logger.info(f"   Total errors: {status['error_count']}")
        logger.info(f"   Uptime: {status['uptime_seconds']:.1f}s")
        
        self.state = SupervisorState.SHUTDOWN
        logger.info("✅ Shutdown complete")


# Global supervisor instance
_supervisor_instance = None


def get_supervisor() -> PipelineSupervisor:
    """Get global supervisor instance"""
    global _supervisor_instance
    if _supervisor_instance is None:
        _supervisor_instance = PipelineSupervisor()
    return _supervisor_instance
