# GitLab CI Pipeline Templates

This directory contains GitLab CI/CD pipeline templates that complement the GitHub Actions templates in the parent directory.

## Available Templates

### 1. GitLab CI Template (gitlab-ci-template.yml)
- **Description:** Complete GitLab CI/CD pipeline template
- **Features:**
  - Multi-stage pipeline (build, test, security, deploy)
  - Parallel job execution
  - Artifacts management
  - Environment-specific deployments
  - Security scanning integration

### 2. GitLab Security Template (gitlab-security-template.yml)
- **Description:** Security-focused GitLab CI pipeline
- **Features:**
  - SAST (Static Application Security Testing)
  - DAST (Dynamic Application Security Testing) 
  - Dependency scanning
  - Container scanning
  - Secret detection
  - License compliance

## Usage

1. Copy the desired template content to your `.gitlab-ci.yml` file
2. Customize the variables and job configurations for your project
3. Set up CI/CD variables in your GitLab project settings
4. Configure any required runners and environments

## Key Features

- **Multi-stage pipelines:** Logical separation of build, test, and deployment stages
- **Conditional execution:** Jobs run based on branch, environment, or manual triggers
- **Artifact management:** Proper handling of build artifacts and test results
- **Security integration:** Built-in security scanning and compliance checks
- **Environment management:** Support for staging and production deployments
- **Monitoring integration:** Health checks and performance monitoring

## Configuration

### Required Variables

Set these in your GitLab project's CI/CD variables:

- `DOCKER_REGISTRY`: Your container registry URL
- `DOCKER_USERNAME`: Registry username
- `DOCKER_PASSWORD`: Registry password
- `STAGING_URL`: Staging environment URL
- `PRODUCTION_URL`: Production environment URL
- `SNYK_TOKEN`: Snyk security scanning token
- `SONAR_TOKEN`: SonarQube analysis token

### Optional Variables

- `NODE_VERSION`: Node.js version (default: 20)
- `PROJECT_NAME`: Project name for artifacts
- `NOTIFICATION_WEBHOOK`: Webhook URL for notifications

## Best Practices

1. **Use appropriate runner tags** for different job types
2. **Implement proper caching** to speed up pipelines
3. **Use artifacts judiciously** to avoid storage bloat
4. **Configure proper retry policies** for flaky tests
5. **Implement security scanning** at multiple stages
6. **Use environment-specific configurations** for deployments