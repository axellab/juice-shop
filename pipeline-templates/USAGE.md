# Pipeline Templates Usage Guide

This guide provides detailed instructions on how to use the DevSecOps pipeline templates in this repository.

## Quick Start

1. **Choose your platform:**
   - GitHub Actions: Use templates in the root directory
   - GitLab CI: Use templates in the `gitlab-ci/` directory

2. **Copy the template:**
   ```bash
   # For GitHub Actions
   cp pipeline-templates/ci-template.yml .github/workflows/ci.yml
   
   # For GitLab CI
   cp pipeline-templates/gitlab-ci/gitlab-ci-template.yml .gitlab-ci.yml
   ```

3. **Customize variables:**
   - Update `PROJECT_NAME`
   - Set `NODE_VERSION` (if applicable)
   - Configure `DOCKER_REGISTRY`
   - Set environment URLs

4. **Configure secrets:**
   - Add required secrets to your repository settings
   - Set up service accounts and API keys

## Template Categories

### 1. Continuous Integration (CI)

**File:** `ci-template.yml`

**Purpose:** Automated building, testing, and validation of code changes

**Key Features:**
- Multi-environment testing (Ubuntu, macOS, Windows)
- Multiple Node.js versions
- Comprehensive test suites (unit, integration, API)
- Code quality checks
- Security scanning
- Performance testing

**Customization:**
```yaml
env:
  PROJECT_NAME: "your-project-name"
  NODE_DEFAULT_VERSION: 20
  DOCKER_REGISTRY: "your-registry.com"
```

**Required Secrets:**
- `CODECOV_TOKEN`
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `CYPRESS_RECORD_KEY`

### 2. Continuous Deployment (CD)

**File:** `cd-template.yml`

**Purpose:** Automated deployment to staging and production environments

**Key Features:**
- Blue-green deployment strategy
- Environment-specific configurations
- Manual approval gates
- Rollback capabilities
- Post-deployment verification

**Customization:**
```yaml
env:
  STAGING_URL: "https://staging.your-domain.com"
  PRODUCTION_URL: "https://your-domain.com"
  DOCKER_REGISTRY: "your-registry.com"
```

**Required Secrets:**
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `STAGING_DEPLOY_KEY`
- `PRODUCTION_DEPLOY_KEY`

### 3. Continuous Testing

**File:** `continuous-testing-template.yml`

**Purpose:** Comprehensive testing automation across all levels

**Key Features:**
- Unit testing with coverage
- Integration testing with services
- End-to-end testing with Cypress
- Performance testing with Lighthouse
- Security testing with ZAP
- Accessibility testing with axe

**Customization:**
```yaml
env:
  TEST_ENVIRONMENT_URL: "http://localhost:3000"
  CYPRESS_CACHE_FOLDER: "~/.cache/Cypress"
  JEST_TIMEOUT: 30000
```

**Required Secrets:**
- `CYPRESS_RECORD_KEY`
- `SNYK_TOKEN`
- `CC_TEST_REPORTER_ID`

### 4. Chaos Engineering

**File:** `chaos-engineering-template.yml`

**Purpose:** Automated resilience testing and chaos experiments

**Key Features:**
- Infrastructure chaos (CPU, memory, disk stress)
- Application chaos (process kills, errors)
- Network chaos (latency, loss, partition)
- Database chaos (connection limits, failover)
- Security chaos (unauthorized access, DDoS)

**Customization:**
```yaml
env:
  STAGING_URL: "https://staging.your-domain.com"
  PRODUCTION_URL: "https://your-domain.com"
  DEFAULT_EXPERIMENT_DURATION: 300
```

**Required Secrets:**
- `KUBERNETES_CONFIG`
- `MONITORING_API_KEY`
- `CHAOS_TOOLKIT_CONFIG`

### 5. Continuous Security

**File:** `security-template.yml`

**Purpose:** Automated security scanning and compliance checks

**Key Features:**
- SAST (Static Application Security Testing)
- DAST (Dynamic Application Security Testing)
- SCA (Software Composition Analysis)
- Container security scanning
- Secret detection
- Compliance checks

**Customization:**
```yaml
env:
  SEVERITY_THRESHOLD: "medium"
  STAGING_URL: "https://staging.your-domain.com"
  PRODUCTION_URL: "https://your-domain.com"
```

**Required Secrets:**
- `SNYK_TOKEN`
- `SONAR_TOKEN`
- `CODECLIMATE_REPO_TOKEN`
- `SECURITY_SCANNER_TOKEN`

## Platform-Specific Instructions

### GitHub Actions

1. **Setup:**
   ```bash
   mkdir -p .github/workflows
   cp pipeline-templates/ci-template.yml .github/workflows/ci.yml
   ```

2. **Configure secrets:**
   - Go to repository Settings → Secrets and Variables → Actions
   - Add required secrets for your chosen templates

3. **Customize triggers:**
   ```yaml
   on:
     push:
       branches: [main, develop]
     pull_request:
       branches: [main]
   ```

### GitLab CI

1. **Setup:**
   ```bash
   cp pipeline-templates/gitlab-ci/gitlab-ci-template.yml .gitlab-ci.yml
   ```

2. **Configure variables:**
   - Go to project Settings → CI/CD → Variables
   - Add required variables for your templates

3. **Setup runners:**
   - Configure shared runners or dedicated runners
   - Ensure runners have required capabilities (Docker, Kubernetes)

## Common Configurations

### Node.js Projects

```yaml
# Add to your template
env:
  NODE_VERSION: 20
  NPM_CONFIG_CACHE: .npm
  NODE_OPTIONS: "--max_old_space_size=4096"

# Update installation step
- name: "Install Dependencies"
  run: |
    npm ci --cache .npm --prefer-offline
    npm run build
```

### Docker Projects

```yaml
# Add to your template
env:
  DOCKER_BUILDKIT: 1
  DOCKER_REGISTRY: "your-registry.com"

# Add Docker build step
- name: "Build Docker Image"
  run: |
    docker build -t $DOCKER_REGISTRY/$PROJECT_NAME:$GITHUB_SHA .
    docker push $DOCKER_REGISTRY/$PROJECT_NAME:$GITHUB_SHA
```

### Kubernetes Deployments

```yaml
# Add to your template
env:
  KUBERNETES_NAMESPACE: "your-namespace"
  DEPLOYMENT_NAME: "your-app"

# Add deployment step
- name: "Deploy to Kubernetes"
  run: |
    kubectl set image deployment/$DEPLOYMENT_NAME \
      app=$DOCKER_REGISTRY/$PROJECT_NAME:$GITHUB_SHA \
      -n $KUBERNETES_NAMESPACE
```

## Best Practices

### 1. Security

- **Never commit secrets** to version control
- **Use environment-specific secrets** for different stages
- **Implement proper access controls** for production deployments
- **Regularly rotate secrets** and API keys
- **Use least privilege principles** for service accounts

### 2. Performance

- **Use caching** for dependencies and build artifacts
- **Parallelize independent jobs** when possible
- **Implement proper timeout values** for long-running operations
- **Use appropriate runner types** for different workloads

### 3. Reliability

- **Implement retry logic** for flaky operations
- **Use proper health checks** for deployments
- **Implement rollback mechanisms** for failed deployments
- **Monitor pipeline success rates** and optimize accordingly

### 4. Maintainability

- **Use descriptive job names** and comments
- **Implement proper artifact management** to avoid storage bloat
- **Use template inheritance** to reduce duplication
- **Document custom configurations** and environment-specific changes

## Monitoring and Alerting

### Pipeline Monitoring

```yaml
# Add to your template
- name: "Notify Pipeline Status"
  if: always()
  run: |
    if [ "${{ job.status }}" == "success" ]; then
      echo "✅ Pipeline successful"
    else
      echo "❌ Pipeline failed"
    fi
    # Add your notification logic here
```

### Integration with Monitoring Tools

- **Prometheus:** Expose pipeline metrics
- **Grafana:** Create dashboards for pipeline visibility
- **PagerDuty:** Configure alerts for critical failures
- **Slack/Teams:** Set up notifications for important events

## Troubleshooting

### Common Issues

1. **Permission Errors:**
   - Check service account permissions
   - Verify secret configurations
   - Ensure proper repository access

2. **Timeout Issues:**
   - Increase timeout values for long-running operations
   - Optimize test execution time
   - Use appropriate runner resources

3. **Resource Limitations:**
   - Monitor runner resource usage
   - Implement proper resource limits
   - Use appropriate instance types

4. **Flaky Tests:**
   - Implement retry mechanisms
   - Use proper wait conditions
   - Isolate test environments

### Debugging Tips

- **Enable debug logging** in CI/CD systems
- **Use step-by-step execution** for complex workflows
- **Implement proper error handling** and reporting
- **Use pipeline visualization tools** for better understanding

## Migration Guide

### From Existing Pipelines

1. **Analyze current pipeline:**
   - Identify existing stages and jobs
   - Document current configurations
   - Note any custom requirements

2. **Map to templates:**
   - Choose appropriate template(s)
   - Identify required customizations
   - Plan migration strategy

3. **Test migration:**
   - Start with non-production environments
   - Verify all functionality works
   - Compare performance and reliability

4. **Gradual rollout:**
   - Migrate one component at a time
   - Monitor for issues
   - Adjust configurations as needed

### From Other Platforms

- **Jenkins:** Map pipeline stages to template jobs
- **Azure DevOps:** Convert YAML syntax and configurations
- **CircleCI:** Adapt job configurations and workflows
- **Travis CI:** Convert build matrices and deployment scripts

## Support and Contributing

### Getting Help

1. **Check documentation** in this repository
2. **Review existing issues** for similar problems
3. **Create new issues** with detailed information
4. **Join community discussions** for best practices

### Contributing

1. **Fork the repository**
2. **Create feature branches** for new templates
3. **Follow coding standards** and documentation requirements
4. **Submit pull requests** with clear descriptions
5. **Participate in reviews** and discussions

## License

These templates are provided under the MIT License, same as the OWASP Juice Shop project.