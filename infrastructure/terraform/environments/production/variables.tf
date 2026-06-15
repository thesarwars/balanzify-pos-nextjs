variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production","staging"], var.environment)
    error_message = "Environment must be production or staging."
  }
}

variable "domain" {
  description = "Primary domain (e.g. app.balanzify.com)"
  type        = string
}

variable "domain_zone" {
  description = "Route53 hosted zone name (e.g. balanzify.com)"
  type        = string
}

variable "jwt_secret" {
  description = "JWT signing secret (min 64 chars)"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.jwt_secret) >= 64
    error_message = "JWT secret must be at least 64 characters."
  }
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.db_password) >= 16
    error_message = "DB password must be at least 16 characters."
  }
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "app_port" {
  description = "API server port"
  type        = number
  default     = 5000
}

variable "api_cpu" {
  description = "ECS task CPU units for API"
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "ECS task memory (MB) for API"
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 2
}

variable "api_max_count" {
  description = "Maximum number of API tasks (auto scaling)"
  type        = number
  default     = 10
}

variable "frontend_desired_count" {
  description = "Desired number of frontend tasks"
  type        = number
  default     = 2
}

variable "api_image_tag" {
  description = "Docker image tag for API"
  type        = string
  default     = "latest"
}

variable "frontend_image_tag" {
  description = "Docker image tag for frontend"
  type        = string
  default     = "latest"
}

variable "alarm_sns_arn" {
  description = "SNS topic ARN for CloudWatch alarms (leave empty to disable)"
  type        = string
  default     = ""
}
