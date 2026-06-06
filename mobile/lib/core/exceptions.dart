/// Application-level exception hierarchy.
///
/// Throw these from services; catch them in screens to show appropriate UI.
sealed class AppException implements Exception {
  /// Creates an [AppException] with the given [message].
  const AppException(this.message);

  /// Human-readable description of the error.
  final String message;

  @override
  String toString() => '$runtimeType: $message';
}

/// Thrown when a request fails due to no network connectivity.
class NetworkException extends AppException {
  /// Creates a [NetworkException].
  const NetworkException([super.message = 'No network connection']);
}

/// Thrown when the server returns a 401 Unauthorized response.
class UnauthorisedException extends AppException {
  /// Creates an [UnauthorisedException].
  const UnauthorisedException([super.message = 'Session expired']);
}

/// Thrown when the server returns an unexpected non-2xx HTTP status code.
class ServerException extends AppException {
  /// Creates a [ServerException] with the given [statusCode].
  const ServerException(this.statusCode, [String message = 'Server error'])
      : super(message);

  /// HTTP status code returned by the server.
  final int statusCode;
}

/// Thrown when the server rejects a request due to invalid input data.
class ValidationException extends AppException {
  /// Creates a [ValidationException].
  const ValidationException([super.message = 'Validation failed']);
}
