import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  handleRetry = () => {
    // Reset the error state and retry
    this.setState({ hasError: false, error: null, errorInfo: null });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div className="w-full h-full max-w-md mx-auto bg-white flex items-center justify-center p-4" style={{ maxHeight: '640px' }}>
          <div className="text-center">
            <h2 className="text-2xl text-red-600 font-bold mb-4">Something went wrong</h2>
            <p className="mb-4 text-gray-700">We're sorry, an error occurred while rendering this screen.</p>
            
            <div className="mb-4">
              <button 
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium"
                onClick={this.handleRetry}
              >
                Try Again
              </button>
            </div>
            
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <details className="text-left bg-gray-100 p-4 rounded-lg mt-4 overflow-auto max-h-60">
                <summary className="font-semibold cursor-pointer">Error Details (Development Only)</summary>
                <pre className="text-sm text-red-700 mt-2 whitespace-pre-wrap">
                  {this.state.error.toString()}
                </pre>
                <pre className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;