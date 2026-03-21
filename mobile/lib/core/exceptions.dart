/// Application-level exception hierarchy.
///
/// Throw these from services; catch them in screens to show appropriate UI.
sealed class AppException implements Exception {
  const AppException(this.message);
  final String message;
  @override
  String toString() => '$runtimeType: $message';
}

class NetworkException extends AppException {
  const NetworkException([super.message = 'No network connection']);
}

class UnauthorisedException extends AppException {
  const UnauthorisedException([super.message = 'Session expired']);
}

class ServerException extends AppException {
  const ServerException(this.statusCode, [String message = 'Server error'])
      : super(message);
  final int statusCode;
}

class ValidationException extends AppException {
  const ValidationException([super.message = 'Validation failed']);
}
