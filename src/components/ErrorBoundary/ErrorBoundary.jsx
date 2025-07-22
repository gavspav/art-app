/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree and displays fallback UI
 */

import React from 'react';
import styles from './ErrorBoundary.module.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      errorId: Date.now().toString(36) + Math.random().toString(36).substr(2)
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Report error to monitoring service if available
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    });

    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  handleReset = () => {
    // Clear any stored state that might be causing the error
    if (this.props.onReset) {
      this.props.onReset();
    }
    
    this.handleRetry();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry, this.handleReset);
      }

      // Default fallback UI
      return (
        <div className={styles.errorBoundary}>
          <div className={styles.errorContainer}>
            <div className={styles.errorIcon}>⚠️</div>
            <h2 className={styles.errorTitle}>
              {this.props.title || 'Something went wrong'}
            </h2>
            <p className={styles.errorMessage}>
              {this.props.message || 'An unexpected error occurred. Please try again.'}
            </p>
            
            {this.props.showDetails && this.state.error && (
              <details className={styles.errorDetails}>
                <summary>Error Details</summary>
                <div className={styles.errorDetailsContent}>
                  <p><strong>Error:</strong> {this.state.error.toString()}</p>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className={styles.errorStack}>
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                  <p><strong>Error ID:</strong> {this.state.errorId}</p>
                </div>
              </details>
            )}

            <div className={styles.errorActions}>
              <button 
                className={styles.retryButton}
                onClick={this.handleRetry}
              >
                Try Again
              </button>
              
              {this.props.showReset && (
                <button 
                  className={styles.resetButton}
                  onClick={this.handleReset}
                >
                  Reset Application
                </button>
              )}
              
              {this.props.showReload && (
                <button 
                  className={styles.reloadButton}
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </button>
              )}
            </div>

            {this.props.supportInfo && (
              <div className={styles.supportInfo}>
                <p>If the problem persists, please contact support with Error ID: <code>{this.state.errorId}</code></p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;