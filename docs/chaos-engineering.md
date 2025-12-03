# Chaos Engineering with Gremlin

This document describes how to use chaos engineering features in OWASP Juice Shop.

## Overview

Chaos engineering is the practice of deliberately introducing controlled failures in a system to test its resilience and identify weaknesses. OWASP Juice Shop includes integration with [Gremlin](https://gremlin.com/), a popular chaos engineering platform, to facilitate these experiments.

## Prerequisites

1. A Gremlin account (Team ID and API Key)
2. Admin access to the Juice Shop application

## Configuration

To enable chaos engineering experiments, you need to modify the `config/chaos.yml` file:

```yaml
chaos:
  enabled: true # Set to true to enable chaos engineering experiments
  gremlin:
    teamId: "your-team-id" # Your Gremlin team ID
    apiKey: "your-api-key" # Your Gremlin API key
    apiUrl: "https://api.gremlin.com/v1" # Gremlin API URL
  experiments:
    # Predefined experiments configuration
```

## Available Experiments

The following chaos experiments are included by default:

1. **Database Outage**: Simulates a database connection failure
2. **API Latency**: Adds latency to API responses
3. **Memory Load**: Simulates memory pressure

You can enable or disable individual experiments in the configuration file.

## Running Experiments

Chaos experiments can be executed via the API. You must be logged in as an admin user to access these endpoints.

### List Available Experiments

```
GET /api/chaos
```

### Run an Experiment

```
GET /api/chaos/:name
```

Where `:name` is the name of the experiment to run (e.g., `database-outage`, `api-latency`, or `memory-load`).

## Analyzing Results

When an experiment is running, you should:

1. Monitor application logs for errors or unexpected behavior
2. Check application metrics for changes in response times, error rates, etc.
3. Verify that the application recovers correctly when the experiment concludes

## Adding Custom Experiments

To add a custom experiment:

1. Update the `config/chaos.yml` file with your new experiment configuration
2. Restart the application to apply the changes

Example configuration for a custom experiment:

```yaml
experiments:
  - name: "custom-experiment"
    description: "My custom chaos experiment"
    enabled: true
    duration: 60 # Duration in seconds
    targetService: "process"
    type: "shutdown"
    args:
      process_name: "my-service"
```

## Best Practices

1. **Start Small**: Begin with low-impact experiments and gradually increase complexity
2. **Set Timeouts**: Always define a duration for experiments to ensure they automatically terminate
3. **Have a Rollback Plan**: Prepare a way to restore normal operation if an experiment causes unexpected issues
4. **Run in Development First**: Always test experiments in development environments before running in production
5. **Communicate**: Inform team members before running experiments that might affect their work